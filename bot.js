// Заглушка HTTP-сервера, чтобы Render не закрывал процесс из-за отсутствия открытых портов
const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// --- 1. ПРОВЕРКА ТОКЕНА ИЗ НАСТРОЕК RENDER ---
const TG_TOKEN = process.env.TG_TOKEN;

if (!TG_TOKEN) {
  console.error('❌ ОШИБКА: Переменная TG_TOKEN не найдена в Environment на Render!');
  process.exit(1);
}

const TG_CHAT_ID = '8070071877';

// --- КОНФИГУРАЦИЯ СЕРВЕРА MINECRAFT ---
const SERVER_HOST = 'phoenix-pe.ru';
const SERVER_PORT = 19135;
const USERNAME = 'RiverSauce1216';
const PASSWORD = 'zona1234';

// Инициализация Telegram-бота
const tgBot = new TelegramBot(TG_TOKEN, { polling: true });

// Подключение к серверу Bedrock
const client = bedrock.createClient({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: USERNAME,
  offline: true,
  version: '1.21.70'
});

// Состояние ресурсов и полёта
let currentPosition = { x: -2420, y: 290, z: -2500 };
let totalElytras = 4;                 // 4 элитры с Нерушимостью III
let currentElytraDurability = 1728;   // Прочность текущей элитры
let rocketsCount = 885;               // 14 стаков ракет
let isFlying = true;
let isBotActive = true;
let highestGroundY = 65;              // Вычисление высоты земли
let flyInterval = null;
let lastFoodCommandTime = 0;

// --- 2. КОМАНДЫ ТЕЛЕГРАМ (/off И /on) ---
tgBot.on('message', (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text ? msg.text.trim() : '';

  if (chatId !== TG_CHAT_ID) return;

  if (text === '/off') {
    if (!isBotActive) {
      tgBot.sendMessage(TG_CHAT_ID, '⚠️ Бот уже находится в процессе отключения.');
      return;
    }
    isBotActive = false;
    isFlying = false;
    if (flyInterval) clearInterval(flyInterval);
    tgBot.sendMessage(TG_CHAT_ID, '🛑 Получена команда **/off**. Начинаем безопасную посадку...', { parse_mode: 'Markdown' });
    safeLandAndDisconnect('🛑 **Принудительное отключение через Telegram (/off).**');
  }

  if (text === '/on') {
    tgBot.sendMessage(TG_CHAT_ID, `ℹ️ **Статус бота:** ${isBotActive ? '🟢 Активен и летит' : '🔴 Отключен'}\n📍 **Высота:** Y=${Math.round(currentPosition.y)}\n🚀 **Ракет:** ${rocketsCount} шт.\n🛡 **Элитр:** ${totalElytras} шт.`, { parse_mode: 'Markdown' });
  }
});

// --- 3. АВТОРИЗАЦИЯ НА СЕРВЕРЕ ---
client.on('modal_form_request', (packet) => {
  console.log('Зафиксирована UI-форма авторизации. Отправляем пароль...');
  client.write('modal_form_response', {
    form_id: packet.form_id,
    data: JSON.stringify([PASSWORD])
  });
});

client.on('spawn', () => {
  console.log(`Бот ${USERNAME} успешно подключен к ${SERVER_HOST}:${SERVER_PORT}`);

  setTimeout(() => {
    client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: USERNAME,
      xuid: '',
      platform_chat_id: '',
      message: `/login ${PASSWORD}`
    });
  }, 2000);

  tgBot.sendMessage(
    TG_CHAT_ID,
    `🤖 **Бот ${USERNAME} запущен!**\n🌐 Сервер: ${SERVER_HOST}:${SERVER_PORT}\n📍 Начало: Y=290\n🚀 Запас ракет: 885 шт\n🛡 Элитр: 4 шт\n🍖 Авто-кормление: Включено (/food)\n📦 Фильтр: Шалкеры (от 1) и Спавнеры (от 5).`,
    { parse_mode: 'Markdown' }
  );

  startFlyLoop();
});

// --- 4. АВТО-КОРМЛЕНИЕ ПРИ ГОЛОДЕ ---
client.on('set_health', (packet) => {
  if (packet.food !== undefined && packet.food <= 16) {
    const now = Date.now();
    if (now - lastFoodCommandTime > 10000) {
      lastFoodCommandTime = now;
      client.queue('text', {
        type: 'chat',
        needs_translation: false,
        source_name: USERNAME,
        xuid: '',
        platform_chat_id: '',
        message: '/food'
      });
      tgBot.sendMessage(TG_CHAT_ID, `🍖 **Зафиксирован голод** (Сытость: ${packet.food}/20). Отправлена команда \`/food\`.`, { parse_mode: 'Markdown' });
    }
  }
});

// --- 5. ЦИКЛ ПОЛЁТА И РАСХОДА РЕСУРСОВ ---
function startFlyLoop() {
  let tickCounter = 0;

  flyInterval = setInterval(() => {
    if (!isFlying || !isBotActive) {
      clearInterval(flyInterval);
      return;
    }

    tickCounter++;

    if (tickCounter % 50 === 0) {
      rocketsCount -= 1;

      if (Math.random() <= 0.25) {
        currentElytraDurability -= 1;
      }

      if (currentElytraDurability <= 50) {
        totalElytras -= 1;

        if (totalElytras > 0) {
          currentElytraDurability = 1728;
          tgBot.sendMessage(TG_CHAT_ID, `🔄 Элитра разряжена! Переключение на следующую. Осталось: ${totalElytras}/4.`);
        } else {
          isFlying = false;
          clearInterval(flyInterval);
          safeLandAndDisconnect('⚠️ **Все 4 элитры разряжены!** Бот снижается.');
          return;
        }
      }

      if (rocketsCount <= 0) {
        isFlying = false;
        clearInterval(flyInterval);
        safeLandAndDisconnect('🚀 **Закончились все 885 ракет!** Начинаем посадку.');
        return;
      }
    }

    const speedRandom = 1.48 + Math.random() * 0.04;
    currentPosition.z += speedRandom;

    const yWiggle = (Math.random() - 0.5) * 0.1;
    const randomPitch = (Math.random() - 0.5) * 0.3;
    const randomYaw = (Math.random() - 0.5) * 0.3;

    try {
      client.write('player_auth_input', {
        pitch: randomPitch,
        yaw: randomYaw,
        position: { x: currentPosition.x, y: currentPosition.y + yWiggle, z: currentPosition.z },
        move_vector: { x: 0, z: speedRandom },
        head_yaw: randomYaw,
        input_data: { start_gliding: true },
        input_mode: 'mouse',
        play_mode: 'normal',
        interaction_model: 'touch',
        gaze_direction: { x: 0, y: 0, z: 0 },
        tick: 0n,
        delta: { x: 0, y: yWiggle, z: speedRandom }
      });
    } catch (err) {
      console.error('Ошибка отправки пакета движения:', err.message);
    }
  }, 50);
}

// --- 6. АНАЛИЗ ЧАНКОВ, ПОИСК ШАЛКЕРОВ/СПАВНЕРОВ И СОЗДАНИЕ NBT-ДАМПА ---
client.on('level_chunk', async (packet) => {
  let shulkersCount = 0;
  let spawnersCount = 0;

  const blockEntities = packet.block_entities || packet.extra_data || [];

  if (Array.isArray(blockEntities)) {
    for (const entity of blockEntities) {
      const id = entity.id ? entity.id.value || entity.id : '';
      const name = String(id).toLowerCase();

      if (name.includes('shulker_box')) {
        shulkersCount++;
      } else if (name.includes('spawner') || name.includes('mob_spawner')) {
        spawnersCount++;
      }

      if (entity.y && entity.y.value) {
        if (entity.y.value > highestGroundY && entity.y.value < 250) {
          highestGroundY = entity.y.value;
        }
      }
    }
  }

  if (shulkersCount >= 1 || spawnersCount >= 5) {
    const posX = Math.round(currentPosition.x);
    const posZ = Math.round(currentPosition.z);

    let msg = `🚨 **ЦЕННАЯ НАХОДКА В ЧАНКЕ!**\n`;
    msg += `👤 **Ник:** ${USERNAME}\n`;
    msg += `📍 **Координаты:** X: ${posX}, Y: ${Math.round(currentPosition.y)}, Z: ${posZ}\n\n`;

    if (shulkersCount > 0) msg += `📦 **Шалкеров:** ${shulkersCount}\n`;
    if (spawnersCount > 0) msg += `🔥 **Спавнеров:** ${spawnersCount}\n`;

    await tgBot.sendMessage(TG_CHAT_ID, msg, { parse_mode: 'Markdown' });

    try {
      const fileName = `nbt_X${posX}_Z${posZ}.json`;
      const filePath = path.join(__dirname, fileName);

      const dumpData = {
        username: USERNAME,
        chunkX: packet.x,
        chunkZ: packet.z,
        position: { x: posX, y: Math.round(currentPosition.y), z: posZ },
        blockEntitiesCount: blockEntities.length,
        blockEntitiesData: blockEntities
      };

      fs.writeFileSync(filePath, JSON.stringify(dumpData, null, 2));

      await tgBot.sendDocument(TG_CHAT_ID, filePath, {
        caption: `📋 NBT-дамп найденного чанка [X: ${posX}, Z: ${posZ}].`
      });

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('Ошибка создания файла дампа:', err);
    }
  }
});

// --- 7. ДИНАМИЧЕСКАЯ ПОСАДКА ---
function safeLandAndDisconnect(reason) {
  const targetSafeY = Math.max(highestGroundY + 2, 67);

  const landInterval = setInterval(() => {
    if (currentPosition.y <= targetSafeY) {
      clearInterval(landInterval);

      tgBot.sendMessage(
        TG_CHAT_ID,
        `${reason}\n📍 **Координаты посадки:** X: ${Math.round(currentPosition.x)}, Y: ${Math.round(currentPosition.y)}, Z: ${Math.round(currentPosition.z)}\n🔒 Бот завершил работу и вышел.`,
        { parse_mode: 'Markdown' }
      );

      setTimeout(() => {
        client.close();
        process.exit(0);
      }, 1000);
      return;
    }

    currentPosition.y -= 1.0;
    try {
      client.write('player_auth_input', {
        pitch: 20,
        yaw: 0,
        position: { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
        move_vector: { x: 0, z: 0.3 },
        head_yaw: 0,
        input_data: {},
        input_mode: 'mouse',
        play_mode: 'normal',
        interaction_model: 'touch',
        gaze_direction: { x: 0, y: 0, z: 0 },
        tick: 0n,
        delta: { x: 0, y: -1.0, z: 0.3 }
      });
    } catch (err) {
      console.error('Ошибка движения при посадке:', err.message);
    }
  }, 50);
}
