const bedrock = require('bedrock-protocol');
const fs = require('fs');

// ⚙️ НАСТРОЙКИ TELEGRAM
const BOT_TOKEN = 'ВАШ_ТОКЕН_БОТА'; // Укажите токен бота
const CHAT_ID = '8070071877';       // Ваш Chat ID подставлен

// ⚙️ НАСТРОЙКИ СЕРВЕРА
const SERVER_HOST = 'phoenix-pe.ru';
const SERVER_PORT = 19132;
const USERNAME = 'RiverSauce1216';

const LOG_FILE = 'log.txt';
fs.writeFileSync(LOG_FILE, `=== ЛОГ ЗАПУСКА ${new Date().toLocaleString()} ===\n\n`);

function logToFile(text) {
  fs.appendFileSync(LOG_FILE, text + '\n');
}

function safeJson(obj) {
  return JSON.stringify(obj, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, 2
  );
}

async function sendToTelegram() {
  console.log('📤 Отправка файла log.txt в Telegram...');
  try {
    const fileData = fs.readFileSync(LOG_FILE);
    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append('document', new Blob([fileData]), 'log.txt');
    formData.append('caption', '📊 Дамп пакетов за 15 секунд соединения');

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.ok) {
      console.log('✅ Файл успешно отправлен!');
    } else {
      console.error('❌ Ошибка Telegram API:', result.description);
    }
  } catch (err) {
    console.error('❌ Ошибка отправки файла:', err.message);
  } finally {
    process.exit(0);
  }
}

const client = bedrock.createClient({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: USERNAME,
  offline: true,
  version: '1.21.30',
  clientData: {
    DeviceOS: 1,
    DeviceModel: 'Samsung SM-S911B',
    CurrentInputMode: 2,
    DefaultInputMode: 2,
    PlatformType: 1,
    GameVersion: '1.21.30'
  }
});

console.log('⏳ Подключение... Запись пакетов запущена на 15 секунд.');

client.on('packet', (data, meta) => {
  const name = meta.name;

  const ignoreList = [
    'level_chunk', 'move_actor_absolute', 'move_player', 
    'set_entity_data', 'update_attributes', 'player_list', 
    'network_chunk_publisher_update', 'level_event', 'actor_event'
  ];
  if (ignoreList.includes(name)) return;

  logToFile(`\n========================================`);
  logToFile(`📦 [ПАКЕТ]: ${name}`);
  logToFile(`========================================`);

  if (name === 'modal_form_request') {
    try {
      logToFile(`📋 ФОРМА:\n${safeJson(JSON.parse(data.data))}`);
    } catch (e) {
      logToFile(`📋 СЫРЫЕ ДАННЫЕ ФОРМЫ:\n${data.data}`);
    }
    return;
  }

  if (name === 'text') {
    logToFile(`💬 ТЕКСТ/ЧАТ [Тип: ${data.type}]: "${data.message}"`);
    return;
  }

  logToFile(safeJson(data));
});

client.on('kick', (reason) => {
  logToFile(`\n❌ [KICK]:\n${safeJson(reason)}`);
});

client.on('error', (err) => {
  logToFile(`\n⚠️ [ОШИБКА]: ${err.message}`);
});

setTimeout(() => {
  console.log('⏱️ 15 секунд прошло. Завершаю запись.');
  sendToTelegram();
}, 15000);
