const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TG_TOKEN = process.env.TG_TOKEN;
if (!TG_TOKEN) {
  console.error('❌ ОШИБКА: Переменная TG_TOKEN не найдена!');
  process.exit(1);
}

const TG_CHAT_ID = '8070071877';

// Подключаемся к ЛОББИ, чтобы бот мог пройти через меню выбора анархии
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

let currentPosition = { x: 0, y: 100, z: 0 };
let isFlying = false;
let isBotActive = true;
let flyInterval = null;

// Обработка меню (форм) от сервера
client.on('modal_form_request', (packet) => {
  try {
    const formData = JSON.parse(packet.data);
    console.log('--- ПОЛУЧЕНО МЕНЮ ОТ СЕРВЕРА ---');
    console.log('Заголовок:', formData.title);
    console.log('Кнопки:', JSON.stringify(formData.buttons, null, 2));

    // Если это форма авторизации — вводим пароль
    if (formData.type === 'custom_form' || (formData.title && formData.title.toLowerCase().includes('авторизация'))) {
      client.write('modal_form_response', {
        form_id: packet.form_id,
        data: JSON.stringify([PASSWORD])
      });
      return;
    }

    // Если это список анархий в лобби
    if (formData.buttons && Array.isArray(formData.buttons)) {
      // Ищем нужную кнопку по названию (например, общую анку или нужный номер)
      // Измените текст '11' на тот, который отображается в лобби для нужной анархии
      const targetIndex = formData.buttons.findIndex(b => b.text && b.text.includes('11'));

      if (targetIndex !== -1) {
        console.log(`Найдена нужная кнопка под индексом: ${targetIndex}. Нажимаем...`);
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: JSON.stringify(targetIndex)
        });
      } else {
        // Если конкретная не найдена, нажмем первую попавшуюся или укажите индекс вручную (например, 0 или 1)
        console.log('Кнопка не найдена по фильтру, нажимаем кнопку 0 по умолчанию');
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: JSON.stringify(0)
        });
      }
    }
  } catch (err) {
    console.error('Ошибка обработки формы:', err.message);
  }
});

client.on('spawn', () => {
  console.log(`Бот ${USERNAME} вошел в игру!`);
  tgBot.sendMessage(TG_CHAT_ID, `🤖 Бот вошел на сервер! Ожидаем перенаправления на анархию.`);
});

client.on('kick', (reason) => {
  console.log('Кик:', reason);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут: ${JSON.stringify(reason)}`);
  process.exit(1);
});

