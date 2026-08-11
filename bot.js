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

client.on('modal_form_request', (packet) => {
  try {
    const rawData = packet.data; 
    const parsedData = JSON.parse(rawData);
    const prettyJson = JSON.stringify(parsedData, null, 2);

    // Создаем файл прямо из пакета сервера и шлем в ТГ
    const fileBuffer = Buffer.from(prettyJson, 'utf8');

    tgBot.sendDocument(TG_CHAT_ID, fileBuffer, {
      caption: `📋 Данные меню от сервера (Form ID: ${packet.form_id})`
    }, {
      filename: `server_menu_${packet.form_id}.txt`,
      contentType: 'text/plain'
    }).then(() => {
      console.log(`✅ Файл меню (Form ID: ${packet.form_id}) успешно отправлен в Telegram.`);
    }).catch((err) => {
      console.error('❌ Ошибка отправки файла в ТГ:', err.message);
    });

    // Оставляем только ввод пароля, если пришла форма авторизации
    if (parsedData.type === 'custom_form' || (parsedData.title && parsedData.title.toLowerCase().includes('авторизация'))) {
      client.write('modal_form_response', {
        form_id: packet.form_id,
        data: JSON.stringify([PASSWORD])
      });
      console.log('Отправлен пароль для авторизации.');
      return;
    }

  } catch (err) {
    console.error('Ошибка обработки формы:', err.message);
  }
});

client.on('spawn', () => {
  console.log(`Бот ${USERNAME} вошел на сервер!`);
  tgBot.sendMessage(TG_CHAT_ID, `🤖 Бот зашел на сервер! Ожидаем входящие меню.`);
});

client.on('kick', (reason) => {
  console.log('Кик:', reason);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут: ${JSON.stringify(reason)}`);
  process.exit(1);
});
