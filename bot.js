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
  version: '1.21.30',
  clientData: {
    DeviceOS: 1,
    DeviceModel: 'Samsung Galaxy S23',
    CurrentInputMode: 2,
    DefaultInputMode: 2,
    PlatformType: 1,
    GameVersion: '1.21.30',
    GuiScale: 0,
    UIProfile: 1
  }
});

let isCapturing = false;
let capturedData = [];

client.on('spawn', () => {
  console.log(`Бот ${USERNAME} вошел в игру! Начинаем 15-секундную запись всех данных.`);
  tgBot.sendMessage(TG_CHAT_ID, `🤖 Бот вошел в игру! Записываю абсолютно все данные и пакеты от сервера в течение 15 секунд...`);
  
  isCapturing = true;
  capturedData = [];

  // Ровно через 15 секунд упаковываем всё в файл и отправляем в ТГ
  setTimeout(async () => {
    isCapturing = false;
    console.log('15 секунд прошло. Отправляем собранный лог в Telegram...');
    
    const logContent = capturedData.join('\n\n-------------------\n\n');
    const fileBuffer = Buffer.from(logContent || 'Никаких данных не поступило за 15 секунд.', 'utf8');
    
    try {
      await tgBot.sendDocument(TG_CHAT_ID, fileBuffer, {
        caption: `📊 Полный лог всех данных от сервера за первые 15 секунд`
      }, {
        filename: `server_dump_15s.txt`,
        contentType: 'text/plain'
      });
    } catch (err) {
      console.error('Ошибка отправки файла в ТГ:', err.message);
    }
  }, 15000);
});

// Перехват вообще всех пакетов, прилетающих от сервера во время записи
client.on('packet', (packet) => {
  if (isCapturing) {
    const packetText = `[Пакет: ${packet.name}] \n${JSON.stringify(packet.data, null, 2)}`;
    capturedData.push(packetText);
  }
});

// Автоматическая авторизация и выбор 11-й анархии
client.on('modal_form_request', (packet) => {
  try {
    const formData = JSON.parse(packet.data);
    
    if (formData.type === 'custom_form' || (formData.title && formData.title.toLowerCase().includes('авторизация'))) {
      client.write('modal_form_response', {
        form_id: packet.form_id,
        data: JSON.stringify([PASSWORD])
      });
      return;
    }

    if (formData.buttons && Array.isArray(formData.buttons)) {
      const targetIndex = formData.buttons.findIndex(b => {
        const textMatch = b.text && b.text.includes('11');
        const imageMatch = b.image && b.image.data && b.image.data.endsWith('/11');
        return textMatch || imageMatch;
      });

      if (targetIndex !== -1) {
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: targetIndex
        });
      } else {
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: 0
        });
      }
    }
  } catch (err) {
    console.error('Ошибка обработки формы:', err.message);
  }
});

client.on('kick', (reason) => {
  console.log('Кик:', reason);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут: ${JSON.stringify(reason)}`);
  process.exit(1);
});

