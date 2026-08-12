const http = require('http');
const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Phoenix-PE Bot is active.');
}).listen(PORT, () => {
  console.log(`[HTTP] Сервер запущен на порту ${PORT}`);
});

process.on('uncaughtException', (err) => console.error('[UNCAUGHT EXCEPTION]', err.message));
process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));

const TG_TOKEN = process.env.TG_TOKEN || '8699310111:AAFrTIY5EMBc39t8B00ASKpHEjxJcW9iBpI';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '8070071877';
const USERNAME = process.env.USERNAME || 'RiverSauce1216';
const PASSWORD = process.env.PASSWORD || 'zona1234';

const TARGET_SERVER = {
  name: '11 Сервер (2x2 для всех)',
  host: '9-13.phoenix-pe.net',
  port: 19134
};

const tgBot = new TelegramBot(TG_TOKEN, { polling: false });

let client = null;
let flyInterval = null;
let reconnectTimer = null;
let isAuthenticated = false;
let isConnecting = false;
let currentTick = 0n;

let rocketCount = 0;
let hasElytra = false;
let elytraDurability = 432;
let isFlying = false;

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
let targetYaw = 0;

const spawnerCounts = new Map();
const foundSpawnerBases = new Set();

function connect() {
  if (isConnecting) return;
  isConnecting = true;

  if (flyInterval) clearInterval(flyInterval);
  isFlying = false;

  console.log(`[CONNECTING] Подключение к ${TARGET_SERVER.name}...`);

  client = bedrock.createClient({
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

  client.on('modal_form_request', (packet) => {
    console.log(`[FORM RECEIVED] ID: ${packet.form_id}, Raw Data: ${packet.data}`);
    let parsedForm = {};
    try {
      parsedForm = JSON.parse(packet.data);
    } catch (e) {
      return;
    }

    setTimeout(() => {
      if (!client) return;
      try {
        if (parsedForm.type === 'custom_form' && Array.isArray(parsedForm.content)) {
          
          // ДИНАМИЧЕСКИЙ ОТВЕТ: Идеально подстраиваемся под форму сервера
          const responseData = parsedForm.content.map(item => {
            if (item.type === 'input') return PASSWORD;
            if (item.type === 'label') return null; // PocketMine требует null для текста
            if (item.type === 'toggle') return false;
            if (item.type === 'dropdown' || item.type === 'slider' || item.type === 'step_slider') return 0;
            return null;
          });

          client.write('modal_form_response', {
            form_id: packet.form_id,
            has_cancel_reason: false,
            data: JSON.stringify(responseData)
          });
          
          console.log(`[FORM AUTH] Отправлен динамический ответ:`, JSON.stringify(responseData));
          isAuthenticated = true;

          // РЕЗЕРВ: Отправляем команду в чат через секунду (на случай, если форма не сработает)
          setTimeout(() => {
            if (client) {
              client.write('text', {
                type: 'chat',
                needs_translation: false,
                source_name: client.username,
                xuid: '',
                platform_chat_id: '',
                message: `/login ${PASSWORD}`
              });
              console.log(`[AUTH FALLBACK] Отправлена команда /login`);
            }
          }, 1000);
        }
      } catch (err) {
        console.error('[FORM ERROR]', err.message);
      }
    }, 500);
  });

  client.on('text', (packet) => {
    const msg = (packet.message || '').toLowerCase();
    if (msg.includes('успешно') || msg.includes('logged in') || msg.includes('добро пожаловать')) {
      isAuthenticated = true;
    }
  });

  client.on('inventory_content', (packet) => updateInventoryStats(packet.items));
  client.on('inventory_slot', (packet) => updateInventoryStats([packet.item]));

  client.on('block_actor_data', (packet) => {
    let blockId = '';
    if (packet.nbt && packet.nbt.value && packet.nbt.value.id) {
      blockId = String(packet.nbt.value.id.value);
    }

    if (blockId === 'MobSpawner' || blockId === 'Spawner') {
      const chunkKey = `${Math.floor(packet.x / 16)}_${Math.floor(packet.z / 16)}`;
      const currentCount = (spawnerCounts.get(chunkKey) || 0) + 1;
      spawnerCounts.set(chunkKey, currentCount);

      if (currentCount >= 5 && !foundSpawnerBases.has(chunkKey)) {
        foundSpawnerBases.add(chunkKey);
        tgBot.sendMessage(TG_CHAT_ID, `🔥 **НАЙДЕНА БАЗА (СПАВНЕРЫ)!**\n🌐 Сервер: ${TARGET_SERVER.name}\n💀 Спавнеров в 1 чанке: ${currentCount} шт.\n📍 X: ${packet.x}, Y: ${packet.y}, Z: ${packet.z}\n🚀 Ракет: ${rocketCount} | 🛡️ Элитра: ${elytraDurability} HP`);
      }
    }
  });

  client.on('spawn', () => {
    isConnecting = false;
    if (isFlying) return;
    isFlying = true;
    console.log(`[ONLINE] Успешный вход на сервер`);

    setTimeout(() => {
      tgBot.sendMessage(TG_CHAT_ID, `✅ Бот в сети на **${TARGET_SERVER.name}**!\n🎒 Элитра: ${hasElytra ? elytraDurability + ' HP' : 'Обнаружена'}\n🚀 Ракет: ${rocketCount} шт.`);
      startFlightLoop();
    }, 3000);
  });

  client.on('kick', (reason) => {
    console.log('[KICK]', JSON.stringify(reason));
    reconnect();
  });

  client.on('error', (err) => console.error('[ERROR]', err.message));
  client.on('close', () => reconnect());
}

function reconnect() {
  if (flyInterval) clearInterval(flyInterval);
  isFlying = false;
  isConnecting = false;

  if (client) {
    try { client.close(); } catch (e) {}
    client = null;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  console.log('[RECONNECT] Переподключение через 10 секунд...');
  reconnectTimer = setTimeout(() => connect(), 10000);
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
      if (currentHp < minDurability) minDurability = currentHp;
    }
  });

  if (newRockets > 0) rocketCount = newRockets;
  if (newElytra) {
    hasElytra = true;
    elytraDurability = minDurability;
  }
}

function startFlightLoop() {
  if (flyInterval) clearInterval(flyInterval);
  let stepCount = 0;

  flyInterval = setInterval(() => {
    if (!client || !isFlying) {
      clearInterval(flyInterval);
      return;
    }

    if (rocketCount <= 0 && stepCount > 100) {
      tgBot.sendMessage(TG_CHAT_ID, `⚠️ **ПОЛЕТ ОСТАНОВЛЕН!** Нет ракет.`);
      clearInterval(flyInterval);
      return;
    }

    const currentSegment = routeGrid[currentSegmentIndex];
    if (!currentSegment) {
      tgBot.sendMessage(TG_CHAT_ID, `🏁 **ОБЛЕТ ЗАВЕРШЕН!**`);
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
      }
    }

    currentTick += 1n;

    try {
      client.write('player_auth_input', {
        pitch: 0,
        yaw: targetYaw,
        position: { x: currentPos.x, y: 120, z: currentPos.z },
        move_vector: { x: 0, z: 1 },
        head_yaw: targetYaw,
        input_data: 0n,
        input_mode: 'touch',
        play_mode: 'normal',
        interaction_mode: 'touch',
        tick: currentTick,
        delta: { x: 0, y: 0, z: 0 },
        analogue_move_vector: { x: 0, z: 0 },
        camera_orientation: { x: 0, y: 0, z: 0 }
      });
    } catch (e) {
      console.error('[AUTH INPUT ERROR]', e.message);
    }
  }, 200);
}

connect();


