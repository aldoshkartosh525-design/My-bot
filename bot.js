client.on('modal_form_request', (packet) => {
  try {
    const formData = JSON.parse(packet.data);
    console.log('--- ПОЛУЧЕНО МЕНЮ ОТ СЕРВЕРА ---');
    console.log('Заголовок:', formData.title);
    console.log('Кнопки:', JSON.stringify(formData.buttons, null, 2));

    // СОЗДАЕМ И ОТПРАВЛЯЕМ ФАЙЛ С МЕНЮ В ТЕЛЕГРАМ
    const fileName = `form_${packet.form_id}.json`;
    fs.writeFileSync(fileName, JSON.stringify(formData, null, 2));
    tgBot.sendDocument(TG_CHAT_ID, fileName, {
      caption: `📋 Получено меню от сервера!\nЗаголовок: ${formData.title || 'Без заголовка'}`
    }).then(() => {
      // Удаляем временный файл после отправки
      fs.unlinkSync(fileName);
    });

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
      const targetIndex = formData.buttons.findIndex(b => b.text && b.text.includes('11'));

      if (targetIndex !== -1) {
        console.log(`Найдена нужная кнопка под индексом: ${targetIndex}. Нажимаем...`);
        client.write('modal_form_response', {
          form_id: packet.form_id,
          data: JSON.stringify(targetIndex)
        });
      } else {
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


