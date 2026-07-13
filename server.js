/* ============================================================
   TRANSPORT LUIS & KATHERINE · Servidor
   Node.js + Express + SQLite (better-sqlite3)
   Todos los usuarios comparten la misma base de datos.
============================================================ */
const express=require('express');
const Database=require('better-sqlite3');
const crypto=require('crypto');
const path=require('path');
const fs=require('fs');

const PUERTO=process.env.PORT||3000;
const DIR_DATOS=process.env.DATA_DIR||__dirname;
if(!fs.existsSync(DIR_DATOS)) fs.mkdirSync(DIR_DATOS,{recursive:true});
const db=new Database(path.join(DIR_DATOS,'tlk.db'));
db.pragma('journal_mode = WAL');

/* ===== Esquema ===== */
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios(
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL, sal TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'usuario',
  creado TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sesiones(
  token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL,
  creado TEXT NOT NULL, ultimo INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS accesos(
  n INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, correo TEXT, fecha TEXT);
CREATE TABLE IF NOT EXISTS datos(
  tienda TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL,
  PRIMARY KEY(tienda,id));
`);

const TIENDAS=['ingresos','gastos','archivos','documentos'];
const nuevoId=()=>Date.now().toString(36)+crypto.randomBytes(4).toString('hex');
const hashPin=(pin,sal)=>crypto.scryptSync(String(pin),sal,32).toString('hex');

const app=express();
app.use(express.json({limit:'100mb'}));
app.use(express.static(__dirname));

/* ===== Autenticación ===== */
function autenticar(req,res,next){
  const cab=req.headers.authorization||'';
  const token=cab.startsWith('Bearer ')?cab.slice(7):'';
  const ses=token&&db.prepare('SELECT * FROM sesiones WHERE token=?').get(token);
  if(!ses) return res.status(401).json({error:'Sesión no válida. Inicia sesión de nuevo.'});
  // sesiones expiran a los 30 días sin uso
  if(Date.now()-ses.ultimo>30*86400000){
    db.prepare('DELETE FROM sesiones WHERE token=?').run(token);
    return res.status(401).json({error:'Sesión expirada. Inicia sesión de nuevo.'});
  }
  const u=db.prepare('SELECT id,nombre,correo,rol FROM usuarios WHERE id=?').get(ses.usuario_id);
  if(!u) return res.status(401).json({error:'Usuario no encontrado.'});
  db.prepare('UPDATE sesiones SET ultimo=? WHERE token=?').run(Date.now(),token);
  req.usuario=u; req.token=token;
  next();
}
function soloAdmin(req,res,next){
  if(req.usuario.rol!=='admin') return res.status(403).json({error:'Solo el administrador puede hacer esto.'});
  next();
}
function validarPinFormato(pin){return /^\d{4}$/.test(String(pin||''));}
function crearSesion(usuario_id){
  const token=crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sesiones(token,usuario_id,creado,ultimo) VALUES(?,?,?,?)')
    .run(token,usuario_id,new Date().toISOString(),Date.now());
  return token;
}
function publico(u){return {id:u.id,nombre:u.nombre,correo:u.correo,rol:u.rol};}

/* ===== Estado y acceso ===== */
app.get('/api/estado',(req,res)=>{
  const n=db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  res.json({hayUsuarios:n>0});
});
app.post('/api/registro-admin',(req,res)=>{
  const n=db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  if(n>0) return res.status(403).json({error:'Ya existe un administrador. Pídele que cree tu cuenta.'});
  const {nombre,correo,pin}=req.body||{};
  if(!nombre||!correo||!String(correo).includes('@')) return res.status(400).json({error:'Nombre y correo válido son obligatorios.'});
  if(!validarPinFormato(pin)) return res.status(400).json({error:'El PIN debe tener exactamente 4 dígitos.'});
  const sal=crypto.randomBytes(16).toString('hex');
  const u={id:nuevoId(),nombre:String(nombre).trim(),correo:String(correo).trim().toLowerCase(),
    pin_hash:hashPin(pin,sal),sal,rol:'admin',creado:new Date().toISOString()};
  db.prepare('INSERT INTO usuarios(id,nombre,correo,pin_hash,sal,rol,creado) VALUES(@id,@nombre,@correo,@pin_hash,@sal,@rol,@creado)').run(u);
  db.prepare('INSERT INTO accesos(nombre,correo,fecha) VALUES(?,?,?)').run(u.nombre,u.correo,new Date().toISOString());
  res.json({token:crearSesion(u.id),usuario:publico(u)});
});
app.post('/api/login',(req,res)=>{
  const {correo,pin}=req.body||{};
  if(!correo||!validarPinFormato(pin)) return res.status(400).json({error:'Escribe tu correo y tu PIN de 4 dígitos.'});
  const u=db.prepare('SELECT * FROM usuarios WHERE correo=?').get(String(correo).trim().toLowerCase());
  if(!u) return res.status(401).json({error:'Ese correo no está registrado.'});
  if(hashPin(pin,u.sal)!==u.pin_hash) return res.status(401).json({error:'PIN incorrecto para ese correo.'});
  db.prepare('INSERT INTO accesos(nombre,correo,fecha) VALUES(?,?,?)').run(u.nombre,u.correo,new Date().toISOString());
  res.json({token:crearSesion(u.id),usuario:publico(u)});
});
app.get('/api/yo',autenticar,(req,res)=>res.json(req.usuario));
app.post('/api/salir',autenticar,(req,res)=>{
  db.prepare('DELETE FROM sesiones WHERE token=?').run(req.token);
  res.json({ok:true});
});
app.put('/api/mi-pin',autenticar,(req,res)=>{
  const {pin}=req.body||{};
  if(!validarPinFormato(pin)) return res.status(400).json({error:'El PIN debe tener 4 dígitos.'});
  const sal=crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE usuarios SET pin_hash=?,sal=? WHERE id=?').run(hashPin(pin,sal),sal,req.usuario.id);
  res.json({ok:true});
});

/* ===== Usuarios (administrador) ===== */
app.get('/api/usuarios',autenticar,soloAdmin,(req,res)=>{
  res.json(db.prepare('SELECT id,nombre,correo,rol,creado FROM usuarios ORDER BY creado').all());
});
app.post('/api/usuarios',autenticar,soloAdmin,(req,res)=>{
  const {nombre,correo,pin,rol}=req.body||{};
  if(!nombre||!correo||!String(correo).includes('@')) return res.status(400).json({error:'Nombre y correo válido son obligatorios.'});
  if(!validarPinFormato(pin)) return res.status(400).json({error:'El PIN debe tener 4 dígitos.'});
  const correoN=String(correo).trim().toLowerCase();
  if(db.prepare('SELECT 1 FROM usuarios WHERE correo=?').get(correoN))
    return res.status(400).json({error:'Ese correo ya está registrado.'});
  const sal=crypto.randomBytes(16).toString('hex');
  const u={id:nuevoId(),nombre:String(nombre).trim(),correo:correoN,pin_hash:hashPin(pin,sal),sal,
    rol:rol==='admin'?'admin':'usuario',creado:new Date().toISOString()};
  db.prepare('INSERT INTO usuarios(id,nombre,correo,pin_hash,sal,rol,creado) VALUES(@id,@nombre,@correo,@pin_hash,@sal,@rol,@creado)').run(u);
  res.json(publico(u));
});
app.delete('/api/usuarios/:id',autenticar,soloAdmin,(req,res)=>{
  const u=db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.params.id);
  if(!u) return res.status(404).json({error:'Usuario no encontrado.'});
  if(u.rol==='admin'){
    const admins=db.prepare("SELECT COUNT(*) c FROM usuarios WHERE rol='admin'").get().c;
    if(admins<=1) return res.status(400).json({error:'Debe existir al menos un administrador.'});
  }
  db.prepare('DELETE FROM usuarios WHERE id=?').run(u.id);
  db.prepare('DELETE FROM sesiones WHERE usuario_id=?').run(u.id);
  res.json({ok:true});
});

/* ===== Sesiones en vivo y accesos ===== */
app.post('/api/latido',autenticar,(req,res)=>res.json({ok:true})); // 'ultimo' ya se actualizó en autenticar
app.get('/api/en-linea',autenticar,soloAdmin,(req,res)=>{
  const corte=Date.now()-30000;
  const filas=db.prepare(`
    SELECT u.nombre n,u.correo c,MAX(s.ultimo) ts FROM sesiones s
    JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.ultimo>=? GROUP BY u.id ORDER BY ts DESC`).all(corte);
  res.json(filas);
});
app.get('/api/accesos',autenticar,soloAdmin,(req,res)=>{
  res.json(db.prepare('SELECT nombre n,correo c,fecha f FROM accesos ORDER BY n DESC LIMIT 50').all());
});

/* ===== Datos compartidos (ingresos, gastos, archivos, documentos) ===== */
function tiendaValida(req,res,next){
  if(!TIENDAS.includes(req.params.tienda)) return res.status(400).json({error:'Tienda no válida.'});
  next();
}
app.get('/api/archivos-meta',autenticar,(req,res)=>{
  const filas=db.prepare("SELECT json FROM datos WHERE tienda='archivos'").all();
  let lista=filas.map(f=>{const a=JSON.parse(f.json);
    return {id:a.id,refId:a.refId,nombre:a.nombre,tipo:a.tipo,fecha:a.fecha};});
  if(req.query.refId) lista=lista.filter(a=>a.refId===req.query.refId);
  res.json(lista);
});
app.get('/api/datos/:tienda',autenticar,tiendaValida,(req,res)=>{
  const filas=db.prepare('SELECT json FROM datos WHERE tienda=?').all(req.params.tienda);
  res.json(filas.map(f=>JSON.parse(f.json)));
});
app.get('/api/datos/:tienda/:id',autenticar,tiendaValida,(req,res)=>{
  const f=db.prepare('SELECT json FROM datos WHERE tienda=? AND id=?').get(req.params.tienda,req.params.id);
  if(!f) return res.status(404).json({error:'No encontrado.'});
  res.json(JSON.parse(f.json));
});
app.put('/api/datos/:tienda/:id',autenticar,tiendaValida,(req,res)=>{
  const obj=req.body||{};
  obj.id=req.params.id;
  db.prepare('INSERT INTO datos(tienda,id,json) VALUES(?,?,?) ON CONFLICT(tienda,id) DO UPDATE SET json=excluded.json')
    .run(req.params.tienda,obj.id,JSON.stringify(obj));
  res.json({ok:true});
});
app.delete('/api/datos/:tienda/:id',autenticar,tiendaValida,(req,res)=>{
  db.prepare('DELETE FROM datos WHERE tienda=? AND id=?').run(req.params.tienda,req.params.id);
  res.json({ok:true});
});
app.delete('/api/datos/:tienda',autenticar,soloAdmin,tiendaValida,(req,res)=>{
  db.prepare('DELETE FROM datos WHERE tienda=?').run(req.params.tienda);
  res.json({ok:true});
});

/* ===== Respaldo, restauración y borrado (administrador) ===== */
app.get('/api/respaldo',autenticar,soloAdmin,(req,res)=>{
  const paquete={app:'TransportLK',version:3,fecha:new Date().toISOString()};
  for(const t of TIENDAS)
    paquete[t]=db.prepare('SELECT json FROM datos WHERE tienda=?').all(t).map(f=>JSON.parse(f.json));
  paquete.documentosImportantes=paquete.documentos;
  paquete.usuarios=db.prepare('SELECT id,nombre,correo,pin_hash,sal,rol,creado FROM usuarios').all();
  paquete.accesos=db.prepare('SELECT nombre,correo,fecha FROM accesos ORDER BY n DESC LIMIT 500').all();
  res.json(paquete);
});
app.post('/api/restaurar',autenticar,soloAdmin,(req,res)=>{
  const p=req.body||{};
  if(p.app!=='TransportLK'||!Array.isArray(p.ingresos)||!Array.isArray(p.gastos))
    return res.status(400).json({error:'El archivo no es un respaldo válido.'});
  const tx=db.transaction(()=>{
    for(const t of TIENDAS){
      db.prepare('DELETE FROM datos WHERE tienda=?').run(t);
      for(const obj of (p[t]||[]))
        db.prepare('INSERT INTO datos(tienda,id,json) VALUES(?,?,?)').run(t,obj.id,JSON.stringify(obj));
    }
    // usuarios solo si vienen con hash de servidor (respaldo v3); si no, se conservan los actuales
    if(Array.isArray(p.usuarios)&&p.usuarios.every(u=>u.pin_hash&&u.sal)&&p.usuarios.some(u=>u.rol==='admin')){
      db.prepare('DELETE FROM usuarios').run();
      const ins=db.prepare('INSERT INTO usuarios(id,nombre,correo,pin_hash,sal,rol,creado) VALUES(@id,@nombre,@correo,@pin_hash,@sal,@rol,@creado)');
      for(const u of p.usuarios) ins.run(u);
      db.prepare('DELETE FROM sesiones WHERE usuario_id NOT IN (SELECT id FROM usuarios)').run();
    }
  });
  tx();
  res.json({ok:true,ingresos:(p.ingresos||[]).length,gastos:(p.gastos||[]).length});
});
app.delete('/api/todo',autenticar,soloAdmin,(req,res)=>{
  const tx=db.transaction(()=>{for(const t of TIENDAS) db.prepare('DELETE FROM datos WHERE tienda=?').run(t);});
  tx();
  res.json({ok:true});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PUERTO,()=>console.log('Transport L&K escuchando en el puerto '+PUERTO+
  ' · base de datos: '+path.join(DIR_DATOS,'tlk.db')));
