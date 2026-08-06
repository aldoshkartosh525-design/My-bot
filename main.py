import asyncio
import os
import re
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

API_TOKEN = os.getenv("BOT_TOKEN")

bot = Bot(token=API_TOKEN)
dp = Dispatcher()

BIND_REGEX = re.compile(r'^/bind\s+([a-zA-Z0-9_]+)\s+(\S+)$')

@dp.message(Command("start"))
async def start_cmd(message: types.Message):
    await message.answer(
        "[Бот] Для того, чтобы привязать игровой аккаунт, выполните следующие действия:\n"
        "1. Напишите (сюда): /bind [Ваш-Ник] [Ваш-Пароль]\n"
        "(Поддержка Ваш пароль не увидит)\n"
        "2. Напишите /help (сюда), чтобы увидеть возможности.\n"
        "Приятной игры на наших серверах!"
    )

@dp.message(Command("help"))
async def help_cmd(message: types.Message):
    await message.answer("Список команд:\n/bind [Ник] [Пароль] — Привязать аккаунт\n/help — Справка")

@dp.message(Command("bind"))
async def bind_cmd(message: types.Message):
    match = BIND_REGEX.match(message.text.strip())
    if match:
        await message.answer("[Бот] Аккаунт был успешно привязан!")
    else:
        await message.answer("[Бот] Неверный формат! Используйте: /bind [Ник] [Пароль]")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
  
