const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// --- КОНФИГУРАЦИЯ СЕРВЕРА И ТЕЛЕГРАМ ---
const TG_TOKEN = process.env.TG_TOKEN || '8857158302:AAFf-hiO0DBRisj3qdmZ5-OPY_JpNBJwMWs';
const TG_CHAT_ID = '8070071877';

const SERVER_HOST = 'phoenix-pe.ru';
const SERVER_PORT = 19135;
const USERNAME = 'RiverSauce1216';
const PASSWORD = 'zona1234';

// Полный доступ к командам в Telegram (polling: true)
const tgBot = new TelegramBot(TG_TOKEN, { polling: true });

const client = bedrock.createClient({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: USERNAME,
  offline: true
});

// Состояние ресурсов из инвентаря
let currentPosition = { x: -2420, y: 290, z: -2500 };
let totalElytras = 4;                 // 4 элитры с Нерушимостью III
let currentElytraDurability = 1728;   // Прочность текущей элитры
let rocketsCount = 885;               // 14 стаков ракет из инвентаря (13x64 + 53)
let isFlying = true;
let isBotActive = true;
let highestGroundY = 65;              // Авто-высота земли
let flyInterval = null;
let lastFoodCommandTime = 0;

// --- УПРАВЛЕНИЕ ЧЕРЕЗ ТЕЛЕГРАМ КОМАНДЫ (/off и /on) ---
tgBot.on('message', (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text ? msg.text.trim() : '';

  if (chatId !== TG_CHAT_ID) return; // Игнорирование чужих сообщений

  if (text === '/off') {
    if (!isBotActive) {
      tgBot.sendMessage(TG_CHAT_ID, '⚠️ Бот уже находится в процессе отключения.');
      return;
    }
    isBotActive = false;
    isFlying = false;
    if (flyInterval) clearInterval(flyInterval);
    tgBot.sendMessage(TG_CHAT_ID, '🛑 Получена команда **/off**. Начинаем безопасную посадку и выход...', { parse_mode: 'Markdown' });
    safeLandAndDisconnect('🛑 **Принудительное отключение через Telegram (/off).**');
  }

  if (text === '/on') {
    tgBot.sendMessage(TG_CHAT_ID, `ℹ️ Статус бота: ${isBotActive ? '🟢 Активен и выполняет полет' : '🔴 Отключен'}\n📍 Высота: Y=${Math.round(currentPosition.y)}\n🚀 Ракет: ${rocketsCount} шт.\n🛡 Элитр: ${totalElytras} шт.`);
  }
});

// --- 1. АВТОРИЗАЦИЯ ЧЕРЕЗ UI-ФОРМУ И ЧАТ ---
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
    `🤖 **Бот ${USERNAME} запущен!**\n🌐 Сервер: ${SERVER_HOST}:${SERVER_PORT}\n📍 Начало: Y=290\n🚀 Запас ракет: 885 шт (14 стаков)\n🛡 Элитр: 4 шт (Нерушимость III)\n🍖 Авто-кормление: Включено (/food)\n📦 Фильтр: Шалкеры (от 1) и Спавнеры (от 5).`,
    { parse_mode: 'Markdown' }
  );

  startFlyLoop();
});

// --- 2. АВТО-КОРМЛЕНИЕ ПРИ ГОЛОДЕ ---
client.on('set_health', (packet) => {
  // В Bedrock Protocol packet.food отражает шкалу сытости (макс. 20)
  if (packet.food !== undefined && packet.food <= 16) {
    const now = Date.now();
    if (now - lastFoodCommandTime > 10000) { // Кулдаун 10 сек
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

// --- 3. ЦИКЛ ПОЛЁТА С УЧЁТОМ РЕСУРСОВ ---
function startFlyLoop() {
  let tickCounter = 0;

  flyInterval = setInterval(() => {
    if (!isFlying || !isBotActive) {
      clearInterval(flyInterval);
      return;
    }

    tickCounter++;

    // Расход ресурсов каждые 2.5 сек (50 тиков)
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

    // Движение вперед с бесшумным шумом для обхода античита
    const speedRandom = 1.48 + Math.random() * 0.04;
    currentPosition.z += speedRandom;

    const yWiggle = (Math.random() - 0.5) * 0.1;
    const randomPitch = (Math.random() - 0.5) * 0.3;
    const randomYaw = (Math.random() - 0.5) * 0.3;

    client.write('player_auth_input', {
      pitch: randomPitch,
      yaw: randomYaw,
      position: { x: currentPosition.x, y: currentPosition.y + yWiggle, z: currentPosition.z },
      move_vector: { x: 0, z: speedRandom },
      input_data: { start_gliding: true }
    });
  }, 50);
}

// --- 4. АНАЛИЗ ЧАНКОВ И СБОРА NBT ---
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
        caption: `📋 NBT-дамп найденного чанка [X: ${posX}, Z: ${posZ}]. Отправь этот файл в чат для расшифровки.`
      });

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('Ошибка создания или отправки дампа:', err);
    }
  }
});

// --- 5. ДИНАМИЧЕСКАЯ БЕЗОПАСНАЯ ПОСАДКА ---
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
    client.write('player_auth_input', {
      pitch: 20,
      yaw: 0,
      position: currentPosition,
      move_vector: { x: 0, z: 0.3 }
    });
  }, 50);
    }

