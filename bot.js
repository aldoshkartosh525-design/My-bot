const http = require('http');
const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Phoenix-PE Bot is active.');
}).listen(PORT, () => {
  console.log(`[HTTP Server] Listening on port ${PORT}`);
});

// НАСТРОЙКИ
const TG_TOKEN = process.env.TG_TOKEN || '8699310111:AAFrTIY5EMBc39t8B00ASKpHEjxJcW9iBpI';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '8070071877';
const USERNAME = process.env.USERNAME || 'RiverSauce1216';
const PASSWORD = process.env.PASSWORD || 'zona1234';

// 11 Сервер (2x2 для всех)
const TARGET_SERVER = {
  name: '11 Сервер (2x2 для всех)',
  host: '9-13.phoenix-pe.net',
  port: 19134
};

const tgBot = new TelegramBot(TG_TOKEN, { polling: false });

console.log(`[CONNECTING] Server: ${TARGET_SERVER.name} (${TARGET_SERVER.host}:${TARGET_SERVER.port})`);

const client = bedrock.createClient({
  host: TARGET_SERVER.host,
  port: TARGET_SERVER.port,
  username: USERNAME,
  offline: true,
  version: '1.21.30',
  clientData: {
    DeviceOS: 1,
    DeviceModel: 'Samsung SM-S911B',
    DeviceModelNumber: 'SM-S911B',
    CurrentInputMode: 2,
    DefaultInputMode: 2,
    PlatformType: 1,
    ClientRandomId: Date.now(),
    DeviceId: 'c7a4e8d2-1f3b-4a5c-890e-123456789abc',
    ArmArchitecture: 1,
    GraphicsProvider: 'Adreno (TM) 740',
    MemoryCategory: 4,
    MaxViewDistance: 12,
    GameVersion: '1.21.30',
    GuiScale: 0,
    UIProfile: 1,
    ThirdPartyName: USERNAME
  }
});

const routeGrid = [
  { start: { x: -2420, z: -2450 }, end: { x: -2420, z: 2450 } },
  { start: { x: -2260, z: 2450 }, end: { x: -2260, z: -2450 } },
  { start: { x: -2100, z: -2450 }, end: { x: -2100, z: 2450 } },
  { start: { x: -1940, z: 2450 }, end: { x: -1940, z: -2450 } },
  { start: { x: -1780, z: -2450 }, end: { x: -1780, z: 2450 } },
  { start: { x: -1620, z: 2450 }, end: { x: -1620, z: -2450 } },
  { start: { x: -1460, z: -2450 }, end: { x: -1460, z: 2450 } },
  { start: { x: -1300, z: 2450 }, end: { x: -1300, z: -2450 } },
  { start: { x: -1140, z: -2450 }, end: { x: -1140, z: 2450 } },
  { start: { x: -980, z: 2450 }, end: { x: -980, z: -2450 } },
  { start: { x: -820, z: -2450 }, end: { x: -820, z: 2450 } },
  { start: { x: -660, z: 2450 }, end: { x: -660, z: -2450 } },
  { start: { x: -500, z: -2450 }, end: { x: -500, z: 2450 } },
  { start: { x: -340, z: 2450 }, end: { x: -340, z: -2450 } },
  { start: { x: -180, z: -2450 }, end: { x: -180, z: 2450 } },
  { start: { x: -20, z: 2450 }, end: { x: -20, z: -2450 } },
  { start: { x: 140, z: -2450 }, end: { x: 140, z: 2450 } },
  { start: { x: 300, z: 2450 }, end: { x: 300, z: -2450 } },
  { start: { x: 460, z: -2450 }, end: { x: 460, z: 2450 } },
  { start: { x: 620, z: 2450 }, end: { x: 620, z: -2450 } },
  { start: { x: 780, z: -2450 }, end: { x: 780, z: 2450 } },
  { start: { x: 940, z: 2450 }, end: { x: 940, z: -2450 } },
  { start: { x: 1100, z: -2450 }, end: { x: 1100, z: 2450 } },
  { start: { x: 1260, z: 2450 }, end: { x: 1260, z: -2450 } },
  { start: { x: 1420, z: -2450 }, end: { x: 1420, z: 2450 } },
  { start: { x: 1580, z: 2450 }, end: { x: 1580, z: -2450 } },
  { start: { x: 1740, z: -2450 }, end: { x: 1740, z: 2450 } },
  { start: { x: 1900, z: 2450 }, end: { x: 1900, z: -2450 } },
  { start: { x: 2060, z: -2450 }, end: { x: 2060, z: 2450 } },
  { start: { x: 2220, z: 2450 }, end: { x: 2220, z: -2450 } },
  { start: { x: 2380, z: -2450 }, end: { x: 2380, z: 2450 } },
  { start: { x: 2420, z: 2450 }, end: { x: 2420, z: -2450 } }
];

let currentSegmentIndex = 0;
let currentPos = { x: routeGrid[0].start.x, y: 120, z: routeGrid[0].start.z };

let rocketCount = 0;
let hasElytra = false;
let elytraDurability = 432;
let flyInterval = null;
let lastFoodTime = 0;
let isFlying = false;

const TOUCH_SENSITIVITY = 1.2;
let currentYaw = 0;
let targetYaw = 0;
let currentPitch = 0;

const foundStorageBases = new Set();
const spawnerCounts = new Map();
const foundSpawnerBases = new Set();

// Вспомогательная функция отправки команд в чат
function sendChatMessage(msg) {
  client.write('text', {
    type: 'chat',
    needs_translation: false,
    source_name: client.username,
    xuid: '',
    platform_chat_id: '',
    message: msg
  });
}

// Авторизация / Регистрация
function sendAuthCommands() {
  console.log(`[AUTH] Отправка команд авторизации для пароля ${PASSWORD}...`);
  sendChatMessage(`/login ${PASSWORD}`);
  setTimeout(() => sendChatMessage(`/register ${PASSWORD} ${PASSWORD}`), 1000);
  setTimeout(() => sendChatMessage(`/reg ${PASSWORD} ${PASSWORD}`), 2000);
}

function updateCameraSmoothly() {
  let diff = targetYaw - currentYaw;
  while (diff < -180) diff += 360;
  while (diff > 180) diff -= 360;

  if (Math.abs(diff) > 0.5) {
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 18 * TOUCH_SENSITIVITY);
    currentYaw += step;
    currentPitch = (Math.random() - 0.5) * 0.4;
  } else {
    currentYaw = targetYaw;
  }
}

function updateInventoryStats(items) {
  if (!Array.isArray(items)) return;

  let newRockets = 0;
  let newElytra = false;
  let minDurability = 432;

  items.forEach(item => {
    if (!item) return;
    const name = (item.name || item.runtime_entity_id || '').toString().toLowerCase();

    if (name.includes('firework') || name.includes('rocket')) {
      newRockets += (item.count || item.stack_size || 1);
    }

    if (name.includes('elytra')) {
      newElytra = true;
      const damage = item.damage || (item.nbt?.value?.Damage?.value) || 0;
      const currentHp = 432 - damage;
      if (currentHp < minDurability) {
        minDurability = currentHp;
      }
    }
  });

  if (newRockets > 0) rocketCount = newRockets;
  if (newElytra) {
    hasElytra = true;
    elytraDurability = minDurability;
  }
}

client.on('inventory_content', (packet) => updateInventoryStats(packet.items));
client.on('inventory_slot', (packet) => updateInventoryStats([packet.item]));
client.on('container_set_content', (packet) => updateInventoryStats(packet.items));

// Чтение чата для авто-пароля и авто-еды
client.on('text', (packet) => {
  const message = (packet.message || '').toLowerCase();

  // Если сервер просит войти/зарегистрироваться
  if (message.includes('login') || message.includes('register') || message.includes('пароль') || message.includes('авторизуйтесь')) {
    sendAuthCommands();
  }
});

client.on('player_attributes', (packet) => {
  if (packet.attributes && Array.isArray(packet.attributes)) {
    packet.attributes.forEach(attr => {
      if (attr.name === 'minecraft:player.hunger' && attr.current < 14) {
        const now = Date.now();
        if (now - lastFoodTime > 5000) {
          lastFoodTime = now;
          sendChatMessage('/food');
        }
      }
    });
  }
});

client.on('block_actor_data', (packet) => {
  let blockId = '';
  if (packet.nbt && packet.nbt.value && packet.nbt.value.id) {
    blockId = String(packet.nbt.value.id.value);
  }

  const x = packet.x;
  const y = packet.y;
  const z = packet.z;
  const chunkKey = `${Math.floor(x / 16)}_${Math.floor(z / 16)}`;

  if (blockId === 'Chest' || blockId === 'TrappedChest' || blockId.includes('ShulkerBox')) {
    if (!foundStorageBases.has(chunkKey)) {
      foundStorageBases.add(chunkKey);
      tgBot.sendMessage(TG_CHAT_ID, `🚨 **НАЙДЕН СКЛАД / ШАЛКЕР!**\n🌐 Сервер: ${TARGET_SERVER.name}\n📦 Блок: ${blockId}\n📍 Координаты: X: ${x}, Y: ${y}, Z: ${z}\n🚀 Ракет: ${rocketCount} | 🛡️ Элитра: ${elytraDurability} HP`);
    }
  }

  if (blockId === 'MobSpawner' || blockId === 'Spawner') {
    const currentCount = (spawnerCounts.get(chunkKey) || 0) + 1;
    spawnerCounts.set(chunkKey, currentCount);

    if (currentCount >= 5 && !foundSpawnerBases.has(chunkKey)) {
      foundSpawnerBases.add(chunkKey);
      tgBot.sendMessage(TG_CHAT_ID, `🔥 **НАЙДЕНА БАЗА (СПАВНЕРЫ)!**\n🌐 Сервер: ${TARGET_SERVER.name}\n💀 Спавнеров в чанке: ${currentCount} шт.\n📍 Координаты: X: ${x}, Y: ${y}, Z: ${z}\n🚀 Ракет: ${rocketCount} | 🛡️ Элитра: ${elytraDurability} HP`);
    }
  }
});

client.on('spawn', () => {
  console.log(`[ONLINE] Вход на ${TARGET_SERVER.name}...`);
  
  // Отправляем пароль сразу при появлении
  sendAuthCommands();

  if (isFlying) return;
  isFlying = true;

  setTimeout(() => {
    tgBot.sendMessage(TG_CHAT_ID, `✅ Бот зашел на **${TARGET_SERVER.name}** и авторизовался!\n🎒 Элитра: ${hasElytra ? elytraDurability + ' HP' : 'Обнаружена'}\n🚀 Ракет: ${rocketCount} шт.\n📐 Старт полета.`);
    startFlightLoop();
  }, 5000);
});

function startFlightLoop() {
  if (flyInterval) clearInterval(flyInterval);

  let stepCount = 0;

  flyInterval = setInterval(() => {
    if (rocketCount <= 0 && stepCount > 100) {
      tgBot.sendMessage(TG_CHAT_ID, `⚠️ **ПОЛЕТ ОСТАНОВЛЕН!** Закончились ракеты.\n🌐 ${TARGET_SERVER.name}\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}`);
      clearInterval(flyInterval);
      return;
    }

    if (hasElytra && elytraDurability <= 50) {
      tgBot.sendMessage(TG_CHAT_ID, `🛑 **ПОЛЕТ ОСТАНОВЛЕН!** Прочность элитры ${elytraDurability} HP (лимит 50).\n🌐 ${TARGET_SERVER.name}\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}`);
      clearInterval(flyInterval);
      return;
    }

    const currentSegment = routeGrid[currentSegmentIndex];
    if (!currentSegment) {
      tgBot.sendMessage(TG_CHAT_ID, `🏁 **ПОЛНЫЙ ОБЛЕТ ЗАВЕРШЕН!** Все 32 пролёта выполнены на ${TARGET_SERVER.name}.`);
      clearInterval(flyInterval);
      return;
    }

    currentPos.x = currentSegment.start.x;
    const zDir = currentSegment.end.z > currentSegment.start.z ? 1 : -1;
    targetYaw = zDir === 1 ? 0 : 180;

    currentPos.z += 5 * zDir;
    stepCount += 5;

    const reachedEnd = zDir === 1 ? currentPos.z >= currentSegment.end.z : currentPos.z <= currentSegment.end.z;

    if (reachedEnd) {
      currentSegmentIndex++;
      if (routeGrid[currentSegmentIndex]) {
        currentPos.x = routeGrid[currentSegmentIndex].start.x;
        currentPos.z = routeGrid[currentSegmentIndex].start.z;
        tgBot.sendMessage(TG_CHAT_ID, `📌 Пролёт №${currentSegmentIndex + 1}/32. Линия X: ${currentPos.x}, Z: ${currentPos.z}`);
      }
    }

    updateCameraSmoothly();

    client.write('player_auth_input', {
      pitch: currentPitch,
      yaw: currentYaw,
      position: { x: currentPos.x, y: 120, z: currentPos.z },
      move_vector: { x: 0, z: 1 },
      head_yaw: currentYaw,
      input_data: 0n,
      input_mode: 'touch',
      play_mode: 'normal',
      interaction_mode: 'touch'
    });

    if (stepCount % 500 === 0) {
      tgBot.sendMessage(TG_CHAT_ID, `✈️ Пролёт №${currentSegmentIndex + 1}/32 (${TARGET_SERVER.name})\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}\n🚀 Ракет: ${rocketCount} | 🛡️ Элитра: ${elytraDurability} HP`);
    }
  }, 200);
}

client.on('kick', (reason) => {
  console.log('[KICK]', reason);
  if (flyInterval) clearInterval(flyInterval);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут с ${TARGET_SERVER.name}: ${JSON.stringify(reason)}`);
  process.exit(1);
});

client.on('error', (err) => {
  console.error('[ERROR]', err.message);
});
