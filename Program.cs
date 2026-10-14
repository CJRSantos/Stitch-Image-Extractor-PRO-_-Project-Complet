using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace StitchImageExtractorPro
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            try
            {
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string appDir = Path.Combine(localAppData, "StitchImageExtractorPRO", "app");
                if (!Directory.Exists(appDir))
                {
                    Directory.CreateDirectory(appDir);
                }

                // Extract embedded assets to local app directory
                Assembly asm = Assembly.GetExecutingAssembly();
                string[] resources = new string[] {
                    "index.html",
                    "styles.css",
                    "app.js",
                    "jszip.min.js",
                    "FileSaver.min.js",
                    "jspdf.umd.min.js",
                    "app.ico"
                };

                foreach (string res in resources)
                {
                    string targetFile = Path.Combine(appDir, res);
                    using (Stream stream = asm.GetManifestResourceStream(res))
                    {
                        if (stream != null)
                        {
                            using (FileStream fs = new FileStream(targetFile, FileMode.Create, FileAccess.Write))
                            {
                                byte[] buf = new byte[16384];
                                int read;
                                while ((read = stream.Read(buf, 0, buf.Length)) > 0)
                                {
                                    fs.Write(buf, 0, read);
                                }
                            }
                        }
                    }
                }

                // Register Windows Start Menu & Desktop Shortcuts so the app appears in Windows Search
                string currentExePath = Assembly.GetExecutingAssembly().Location;
                string iconPath = Path.Combine(appDir, "app.ico");
                if (!File.Exists(iconPath))
                {
                    iconPath = currentExePath;
                }

                RegisterShortcuts(currentExePath, iconPath);

                // Launch in clean Standalone App Window (Edge / Chrome)
                string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edgePath))
                {
                    edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                }

                string htmlFile = Path.Combine(appDir, "index.html");
                string fileUri = new Uri(htmlFile).AbsoluteUri;
                string profileDir = Path.Combine(localAppData, "StitchImageExtractorPRO", "profile");

                if (File.Exists(edgePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = edgePath;
                    psi.Arguments = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1300,860", fileUri, profileDir);
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else
                {
                    // Fallback to default browser
                    Process.Start(new ProcessStartInfo(fileUri) { UseShellExecute = true });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error iniciando Stitch Image Extractor PRO: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void RegisterShortcuts(string targetExe, string iconPath)
        {
            try
            {
                string startMenu = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    @"Microsoft\Windows\Start Menu\Programs\Stitch Image Extractor PRO.lnk"
                );
                string desktop = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    "Stitch Image Extractor PRO.lnk"
                );

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType);

                // Start Menu shortcut (indexed by Windows Search)
                dynamic scStart = shell.CreateShortcut(startMenu);
                scStart.TargetPath = targetExe;
                scStart.WorkingDirectory = Path.GetDirectoryName(targetExe);
                if (File.Exists(iconPath))
                {
                    scStart.IconLocation = iconPath + ",0";
                }
                scStart.Description = "Stitch Image Extractor PRO - Extrae imágenes y crea PDFs limpios";
                scStart.Save();

                // Desktop shortcut
                if (!File.Exists(desktop))
                {
                    dynamic scDesk = shell.CreateShortcut(desktop);
                    scDesk.TargetPath = targetExe;
                    scDesk.WorkingDirectory = Path.GetDirectoryName(targetExe);
                    if (File.Exists(iconPath))
                    {
                        scDesk.IconLocation = iconPath + ",0";
                    }
                    scDesk.Description = "Stitch Image Extractor PRO";
                    scDesk.Save();
                }
            }
            catch
            {
                // Silently continue if shortcut creation is restricted by policy
            }
        }
    }
}
