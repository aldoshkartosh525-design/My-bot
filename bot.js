client.on('modal_form_request', (packet) => {
  try {
    const formData = JSON.parse(packet.data);
    
    // Превращаем весь объект формы в красивую строку, как в логах
    const formattedLog = JSON.stringify(formData, null, 2);
    console.log('--- ПОЛУЧЕНО МЕНЮ ОТ СЕРВЕРА ---');
    console.log(formattedLog);

    // ОТПРАВКА В TELEGRAM ТЕКСТОМ (или файлом .txt со строками)
    const fileName = `log_${packet.form_id}.txt`;
    fs.writeFileSync(fileName, formattedLog, 'utf8');
    
    tgBot.sendDocument(TG_CHAT_ID, fileName, {
      caption: `📋 Лог меню с сервера (ID: ${packet.form_id})`
    }).then(() => {
      fs.unlinkSync(fileName); // Удаляем файл после отправки
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

