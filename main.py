import os
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = 8070071877  # Твой ID

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

@dp.message(Command("start"))
async def start_handler(message: types.Message):
    # Ответ пользователю
    await message.answer("Привет! Твое сообщение доставлено.")
    
    # Уведомление лично тебе в ЛС
    user_info = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    await bot.send_message(
        chat_id=ADMIN_ID, 
        text=f"🔔 Пользователь {user_info} (ID: {message.from_user.id}) нажал /start!"
    )

# Пересылка любого другого текста тебе в ЛС
@dp.message()
async def forward_to_admin(message: types.Message):
    await message.answer("Сообщение отправлено админу!")
    user_info = f"@{message.from_user.username}" if message.from_user.username else message.from_user.first_name
    await bot.send_message(
        chat_id=ADMIN_ID,
        text=f"📩 Новое сообщение от {user_info}:\n\n{message.text}"
    )

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
    
