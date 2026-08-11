const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');

const TG_TOKEN = process.env.TG_TOKEN;
if (!TG_TOKEN) {
  console.error('❌ ОШИБКА: Переменная TG_TOKEN не найдена!');
  process.exit(1);
}

const TG_CHAT_ID = '8070071877';
const SERVER_HOST = 'phoenix-pe.ru';
const SERVER_PORT = 19132;
const USERNAME = 'RiverSauce1216';
const PASSWORD = 'zona1234';

const tgBot = new TelegramBot(TG_TOKEN, { polling: true });

const client = bedrock.createClient({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: USERNAME,
  offline: true,
  version: '1.21.30'
});

// ТОЧНАЯ СЕТКА МАРШРУТА
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

let isOnAnarchy = false;
let rocketCount = 0;
let hasElytra = false;
let elytraDurability = 432;

let flyInterval = null;
let lastFoodTime = 0;

const foundStorageBases = new Set();
const spawnerCounts = new Map();
const foundSpawnerBases = new Set();

// Подсчет ракет и элитры
function updateInventoryStats(items) {
  if (!Array.isArray(items)) return;

  let newRockets = 0;
  let newElytra = false;
  let minDurability = 432;

  items.forEach(item => {
    if (!item || !item.name) return;
    const name = item.name.toLowerCase();

    if (name.includes('firework') || name.includes('rocket')) {
      newRockets += (item.count || 1);
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

  rocketCount = newRockets;
  hasElytra = newElytra;
  elytraDurability = hasElytra ? minDurability : 0;
}

client.on('inventory_content', (packet) => updateInventoryStats(packet.items));
client.on('container_set_content', (packet) => updateInventoryStats(packet.items));

// Авто-кормёжка (/food)
client.on('player_attributes', (packet) => {
  if (!isOnAnarchy) return;

  if (packet.attributes && Array.isArray(packet.attributes)) {
    packet.attributes.forEach(attr => {
      if (attr.name === 'minecraft:player.hunger' && attr.current < 14) {
        const now = Date.now();
        if (now - lastFoodTime > 5000) {
          lastFoodTime = now;
          client.write('text', {
            type: 'chat',
            needs_translation: false,
            source_name: client.username,
            xuid: '',
            platform_chat_id: '',
            message: '/food'
          });
        }
      }
    });
  }
});

// Авторизация и вход на 11-ю анархию
client.on('modal_form_request', (packet) => {
  try {
    const formData = JSON.parse(packet.data);

    setTimeout(() => {
      if (formData.type === 'custom_form' || (formData.title && formData.title.toLowerCase().includes('авторизация'))) {
        client.write('modal_form_response', { form_id: packet.form_id, data: JSON.stringify([PASSWORD]) });
        return;
      }

      if (formData.buttons && Array.isArray(formData.buttons)) {
        const targetIndex = formData.buttons.findIndex(b => {
          return (b.text && b.text.includes('11')) || (b.image && b.image.data && b.image.data.endsWith('/11'));
        });

        const selectedIndex = targetIndex !== -1 ? targetIndex : 10;
        client.write('modal_form_response', { form_id: packet.form_id, data: selectedIndex });
      }
    }, 800);
  } catch (err) {
    console.error('Ошибка формы:', err.message);
  }
});

// Детект баз (Склады и Спавнеры от 5 шт/чанк)
client.on('block_actor_data', (packet) => {
  if (!isOnAnarchy) return;

  let blockId = '';
  if (packet.nbt && packet.nbt.value && packet.nbt.value.id) {
    blockId = String(packet.nbt.value.id.value);
  }

  const x = packet.x;
  const y = packet.y;
  const z = packet.z;
  const chunkKey = `${Math.floor(x / 16)}_${Math.floor(z / 16)}`;

  // 1. Склады
  if (blockId === 'Chest' || blockId === 'TrappedChest' || blockId.includes('ShulkerBox')) {
    if (!foundStorageBases.has(chunkKey)) {
      foundStorageBases.add(chunkKey);
      tgBot.sendMessage(TG_CHAT_ID, `🚨 **НАЙДЕНА БАЗА (СКЛАД)!**\n📦 Хранилище: ${blockId}\n📍 Координаты: X: ${x}, Y: ${y}, Z: ${z}\n🚀 Ракет: ${rocketCount} шт. | Элитра: ${elytraDurability} HP`);
    }
  }

  // 2. Спавнеры
  if (blockId === 'MobSpawner' || blockId === 'Spawner') {
    const currentCount = (spawnerCounts.get(chunkKey) || 0) + 1;
    spawnerCounts.set(chunkKey, currentCount);

    if (currentCount >= 5 && !foundSpawnerBases.has(chunkKey)) {
      foundSpawnerBases.add(chunkKey);
      tgBot.sendMessage(TG_CHAT_ID, `🔥 **НАЙДЕНА БАЗА (СПАВНЕРЫ)!**\n💀 Кол-во спавнеров в чанке: ${currentCount} шт.\n📍 Координаты: X: ${x}, Y: ${y}, Z: ${z}\n🚀 Ракет: ${rocketCount} шт. | Элитра: ${elytraDurability} HP`);
    }
  }
});

client.on('spawn', () => {
  console.log(`Бот вошел в мир!`);
  
  setTimeout(() => {
    isOnAnarchy = true;
    tgBot.sendMessage(TG_CHAT_ID, `✅ Бот на 11 анархии!\n🎒 Элитра: ${hasElytra ? elytraDurability + ' HP' : 'Нет'}\n🚀 Ракет: ${rocketCount} шт.\n📐 Запуск полёта по вашей сетке из 32 пролётов.`);
    startFlightLoop();
  }, 3000);
});

// Полёт strictly по вашей сетке
function startFlightLoop() {
  if (flyInterval) clearInterval(flyInterval);

  let stepCount = 0;

  flyInterval = setInterval(() => {
    if (!isOnAnarchy) return;

    // ПРОВЕРКА РАКЕТ И ЭЛИТРЫ
    if (rocketCount <= 0) {
      tgBot.sendMessage(TG_CHAT_ID, `⚠️ **ПОЛЕТ ОСТАНОВЛЕН!** Закончились ракеты.\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}`);
      clearInterval(flyInterval);
      return;
    }

    if (hasElytra && elytraDurability <= 50) {
      tgBot.sendMessage(TG_CHAT_ID, `🛑 **ПОЛЕТ ОСТАНОВЛЕН!** Прочность элитры ${elytraDurability} HP (лимит 50).\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}`);
      clearInterval(flyInterval);
      return;
    }

    const currentSegment = routeGrid[currentSegmentIndex];
    
    // Если прошли всю сетку
    if (!currentSegment) {
      tgBot.sendMessage(TG_CHAT_ID, `🏁 **КАРТА ПОЛНОСТЬЮ ОБЛЕТЕНА!** Все 32 пролёта завершены.`);
      clearInterval(flyInterval);
      return;
    }

    // Движение по Z
    currentPos.x = currentSegment.start.x;
    const zDir = currentSegment.end.z > currentSegment.start.z ? 1 : -1;
    currentPos.z += 5 * zDir;
    stepCount += 5;

    // Проверка завершения текущей линии
    const reachedEnd = zDir === 1 ? currentPos.z >= currentSegment.end.z : currentPos.z <= currentSegment.end.z;

    if (reachedEnd) {
      currentSegmentIndex++;
      if (routeGrid[currentSegmentIndex]) {
        currentPos.x = routeGrid[currentSegmentIndex].start.x;
        currentPos.z = routeGrid[currentSegmentIndex].start.z;
        tgBot.sendMessage(TG_CHAT_ID, `📌 Переход на пролёт №${currentSegmentIndex + 1}/32. Линия X: ${currentPos.x}, Z: ${currentPos.z}`);
      }
    }

    // Отправка движения серверу
    client.write('player_auth_input', {
      pitch: 0,
      yaw: zDir === 1 ? 0 : 180,
      position: { x: currentPos.x, y: 120, z: currentPos.z },
      move_vector: { x: 0, z: 1 },
      head_yaw: 0,
      input_data: 0,
      input_mode: 'normal',
      play_mode: 'normal',
      interaction_mode: 'normal'
    });

    // Отчет каждые 500 блоков
    if (stepCount % 500 === 0) {
      tgBot.sendMessage(TG_CHAT_ID, `✈️ Пролёт №${currentSegmentIndex + 1}/32\n📍 Координаты: X: ${Math.round(currentPos.x)}, Y: 120, Z: ${Math.round(currentPos.z)}\n🚀 Ракет: ${rocketCount} шт. | 🛡️ Элитра: ${elytraDurability} HP`);
    }
  }, 200);
}

client.on('kick', (reason) => {
  console.log('Кик:', reason);
  if (flyInterval) clearInterval(flyInterval);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут: ${JSON.stringify(reason)}`);
  process.exit(1);
});
