/* ===================================================
   ROLEPLAY SERVER — WebSocket для синхронизации игроков
   =================================================== */
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// HTTP-сервер (нужен для проверки работоспособности)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Roleplay WebSocket Server работает ✅\n');
});

const wss = new WebSocket.Server({ server });

// Хранилище игроков: { id: { ws, nick, x, y, skin, skinStyle, color, admin, level, server } }
const players = new Map();

console.log('🚀 Сервер запущен на порту', PORT);

wss.on('connection', (ws) => {
  console.log('🔌 Новый клиент подключился');

  let playerId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // === Игрок заходит ===
      if (msg.type === 'join') {
        playerId = msg.id;
        players.set(playerId, {
          ws,
          id: playerId,
          nick: msg.nick,
          x: msg.x || 1000,
          y: msg.y || 1000,
          skin: msg.skin,
          skinStyle: msg.skinStyle,
          color: msg.color || '#4facfe',
          admin: msg.admin || false,
          level: msg.level || 1,
          server: msg.server || 'rp1',
          lastUpdate: Date.now()
        });

        console.log(`✅ ${msg.nick} зашёл (${playerId})`);
        console.log(`👥 Игроков онлайн: ${players.size}`);

        // Отправляем ему список всех игроков (кроме себя)
        const others = [];
        players.forEach(p => {
          if (p.id !== playerId) others.push(publicPlayer(p));
        });
        ws.send(JSON.stringify({ type: 'players_list', players: others }));

        // Всем остальным сообщаем о новом игроке
        broadcast({ type: 'player_join', player: publicPlayer(players.get(playerId)) }, playerId);
        return;
      }

      // === Обновление позиции ===
      if (msg.type === 'move' && playerId) {
        const p = players.get(playerId);
        if (!p) return;
        p.x = msg.x;
        p.y = msg.y;
        if (msg.skin) p.skin = msg.skin;
        if (msg.skinStyle) p.skinStyle = msg.skinStyle;
        if (msg.color) p.color = msg.color;
        if (msg.admin !== undefined) p.admin = msg.admin;
        if (msg.level !== undefined) p.level = msg.level;
        p.lastUpdate = Date.now();

        // Рассылаем всем кроме себя
        broadcast({
          type: 'player_move',
          id: playerId,
          x: p.x,
          y: p.y
        }, playerId);
        return;
      }

      // === Чат (опционально, можно оставить в Firebase) ===
      if (msg.type === 'chat' && playerId) {
        const p = players.get(playerId);
        if (!p) return;
        broadcast({
          type: 'chat',
          nick: p.nick,
          text: msg.text,
          ts: Date.now()
        });
        return;
      }

    } catch(e) {
      console.warn('Ошибка обработки сообщения:', e.message);
    }
  });

  ws.on('close', () => {
    if (playerId) {
      const p = players.get(playerId);
      console.log(`❌ ${p ? p.nick : playerId} вышел`);
      players.delete(playerId);
      broadcast({ type: 'player_leave', id: playerId });
      console.log(`👥 Игроков онлайн: ${players.size}`);
    }
  });

  ws.on('error', (err) => {
    console.warn('WS ошибка:', err.message);
  });
});

// Убираем "мёртвых" игроков (не обновлялись > 10 сек)
setInterval(() => {
  const now = Date.now();
  players.forEach((p, id) => {
    if (now - p.lastUpdate > 10000) {
      console.log(`⏱️ ${p.nick} отключён по таймауту`);
      try { p.ws.close(); } catch(e){}
      players.delete(id);
      broadcast({ type: 'player_leave', id });
    }
  });
}, 5000);

// Отправить всем, кроме одного
function broadcast(data, exceptId = null) {
  const str = JSON.stringify(data);
  players.forEach((p, id) => {
    if (id === exceptId) return;
    if (p.ws.readyState === WebSocket.OPEN) {
      try { p.ws.send(str); } catch(e){}
    }
  });
}

// Публичные поля игрока (без ws)
function publicPlayer(p) {
  return {
    id: p.id,
    nick: p.nick,
    x: p.x,
    y: p.y,
    skin: p.skin,
    skinStyle: p.skinStyle,
    color: p.color,
    admin: p.admin,
    level: p.level
  };
}

server.listen(PORT, () => {
  console.log(`✅ HTTP + WS сервер слушает порт ${PORT}`);
});