const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);

const bedrock = require('bedrock-protocol');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

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
    const formData = JSON.parse(packet.data);
    const formattedLog = JSON.stringify(formData, null, 2);
    console.log('--- ПОЛУЧЕНО МЕНЮ ОТ СЕРВЕРА ---');
    console.log(formattedLog);

    // СОХРАНЯЕМ И ОТПРАВЛЯЕМ ПОЛНЫЙ ФАЙЛ С ДАННЫМИ МЕНЮ В TELEGRAM
    const fileName = `menu_full_${packet.form_id}.txt`;
    fs.writeFileSync(fileName, formattedLog, 'utf8');
    tgBot.sendDocument(TG_CHAT_ID, fileName, {
      caption: `📋 Полные данные меню от сервера (ID: ${packet.form_id})`
    }).then(() => {
      fs.unlinkSync(fileName); // Удаляем файл после отправки
    }).catch(err => console.error('Ошибка отправки файла в ТГ:', err.message));

    // Если это форма авторизации — вводим пароль
    if (formData.type === 'custom_form' || (formData.title && formData.title.toLowerCase().includes('авторизация'))) {
      client.write('modal_form_response', {
        form_id: packet.form_id,
        data: JSON.stringify([PASSWORD])
      });
      console.log('Отправлен пароль для авторизации.');
      return;
    }

    // Если это список анархий в лобби
    if (formData.buttons && Array.isArray(formData.buttons)) {
      // Ищем кнопку 11-й анархии по тексту или пути текстуры
      const targetIndex = formData.buttons.findIndex(b => {
        const textMatch = b.text && b.text.includes('11');
        const imageMatch = b.image && b.image.data && b.image.data.endsWith('/11');
        return textMatch || imageMatch;
      });

      if (targetIndex !== -1) {
        console.log(`✅ Найдена 11-я анархия под индексом: ${targetIndex}. Нажимаем...`);
        
        // Отправляем индекс корректно, чтобы сервер не кикал
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: targetIndex
        });
        
        tgBot.sendMessage(TG_CHAT_ID, `🚀 Бот успешно выбрал 11-ю анархию (индекс ${targetIndex})!`);
      } else {
        console.log('⚠️ 11-я анархия не найдена по фильтру, нажимаем кнопку 0 по умолчанию');
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

client.on('spawn', () => {
  console.log(`Бот ${USERNAME} вошел в игру!`);
  tgBot.sendMessage(TG_CHAT_ID, `🤖 Бот вошел на сервер! Ожидаем перенаправления на анархию.`);
});

client.on('kick', (reason) => {
  console.log('Кик:', reason);
  tgBot.sendMessage(TG_CHAT_ID, `❌ Бот кикнут: ${JSON.stringify(reason)}`);
  process.exit(1);
});

