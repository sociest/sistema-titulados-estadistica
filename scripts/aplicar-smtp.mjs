import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const rutaTxt = path.join(root, "smtp_pass.txt");
const rutaEnv = path.join(root, ".env");

if (!fs.existsSync(rutaTxt)) {
  console.error("Error: no se encontró smtp_pass.txt");
  process.exit(1);
}

const lineasTxt = fs.readFileSync(rutaTxt, "utf-8").split("\n");
let pass = "";
for (const l of lineasTxt) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  if (t.startsWith("SMTP_PASS=")) {
    pass = t.replace(/^SMTP_PASS=/, "").trim();
  } else {
    pass = t;
  }
  if (pass) break;
}

if (!pass) {
  console.log("Aviso: smtp_pass.txt no tiene una contraseña escrita todavía.");
  console.log("Edite el archivo sistema-titulados-estadistica-main/smtp_pass.txt y coloque la contraseña de 16 caracteres de Google.");
  process.exit(0);
}

if (fs.existsSync(rutaEnv)) {
  let envContent = fs.readFileSync(rutaEnv, "utf-8");
  if (/^SMTP_PASS=.*$/m.test(envContent)) {
    envContent = envContent.replace(/^SMTP_PASS=.*$/m, `SMTP_PASS=${pass}`);
  } else {
    envContent += `\nSMTP_PASS=${pass}\n`;
  }
  fs.writeFileSync(rutaEnv, envContent, "utf-8");
  console.log("✓ Contraseña SMTP sincronizada con éxito en .env");
}

console.log("Para reiniciar la aplicación con las nuevas credenciales:");
console.log("  wsl -d Ubuntu-22.04 sh -c 'cd /mnt/d/UMSA/7mo_Semestre/TRA_374_PRAC_PROF/zsistema/sistema-titulados-estadistica-main && docker compose up -d app'");
