using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace StitchImageExtractorPro
{
    static class Program
    {
        private static HttpListener listener;
        private static int port;
        private static bool isRunning = true;

        [STAThread]
        static void Main()
        {
            try
            {
                // Find an available port
                TcpListener tcp = new TcpListener(IPAddress.Loopback, 0);
                tcp.Start();
                port = ((IPEndPoint)tcp.LocalEndpoint).Port;
                tcp.Stop();

                // Start HttpListener on localhost
                listener = new HttpListener();
                listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
                listener.Start();

                // Start background HTTP thread
                Thread serverThread = new Thread(ListenLoop);
                serverThread.IsBackground = true;
                serverThread.Start();

                // Locate Edge or Chrome
                string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edgePath))
                {
                    edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                }

                string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StitchImageExtractorPRO", "Profile");
                if (!Directory.Exists(profileDir))
                {
                    Directory.CreateDirectory(profileDir);
                }

                string appUrl = "http://127.0.0.1:" + port + "/";

                Process browserProc = null;
                if (File.Exists(edgePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = edgePath;
                    psi.Arguments = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1300,860", appUrl, profileDir);
                    psi.UseShellExecute = false;
                    browserProc = Process.Start(psi);
                }
                else
                {
                    Process.Start(new ProcessStartInfo(appUrl) { UseShellExecute = true });
                }

                if (browserProc != null)
                {
                    browserProc.WaitForExit();
                }
                else
                {
                    Thread.Sleep(Timeout.Infinite);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error iniciando Stitch Image Extractor PRO: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                isRunning = false;
                if (listener != null && listener.IsListening)
                {
                    listener.Stop();
                }
            }
        }

        private static void ListenLoop()
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            while (isRunning)
            {
                try
                {
                    HttpListenerContext context = listener.GetContext();
                    string path = context.Request.Url.AbsolutePath.TrimStart('/');
                    if (string.IsNullOrEmpty(path)) path = "index.html";

                    string contentType = "application/octet-stream";
                    if (path.EndsWith(".html", StringComparison.OrdinalIgnoreCase)) contentType = "text/html; charset=utf-8";
                    else if (path.EndsWith(".css", StringComparison.OrdinalIgnoreCase)) contentType = "text/css; charset=utf-8";
                    else if (path.EndsWith(".js", StringComparison.OrdinalIgnoreCase)) contentType = "application/javascript; charset=utf-8";
                    else if (path.EndsWith(".png", StringComparison.OrdinalIgnoreCase)) contentType = "image/png";
                    else if (path.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)) contentType = "image/jpeg";
                    else if (path.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)) contentType = "image/svg+xml";

                    Stream stream = asm.GetManifestResourceStream(path);
                    if (stream != null)
                    {
                        context.Response.ContentType = contentType;
                        context.Response.ContentLength64 = stream.Length;
                        context.Response.Headers.Add("Cache-Control", "no-cache");
                        byte[] buffer = new byte[16384];
                        int read;
                        while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            context.Response.OutputStream.Write(buffer, 0, read);
                        }
                        stream.Close();
                    }
                    else
                    {
                        context.Response.StatusCode = 404;
                        byte[] notFound = Encoding.UTF8.GetBytes("Not found");
                        context.Response.OutputStream.Write(notFound, 0, notFound.Length);
                    }
                    context.Response.OutputStream.Close();
                }
                catch
                {
                    if (!isRunning) break;
                }
            }
        }
    }
}
