import os
import asyncio
import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from orchestrator import process_intent
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler for the /start command."""
    welcome_text = (
        "🤖 *Selamat datang di SealedClaw Agent*\n\n"
        "Saya adalah asisten AI otonom yang berjalan di atas TEE dan jaringan 0G.\n"
        "Apa yang ingin Anda optimasikan hari ini?\n\n"
        "Contoh: 'Tolong optimasi yield saya hari ini dengan risiko maksimal 5%.'"
    )
    await update.message.reply_text(welcome_text, parse_mode='Markdown')

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handler for all other text messages."""
    user_text = update.message.text
    
    # 1. Inform user processing has started
    status_msg = await update.message.reply_text("⏳ *Memproses intent Anda via OpenClaw...*", parse_mode='Markdown')
    
    try:
        # 2. Execute the OpenClaw Agent
        # We run the synchronous process_intent in a separate thread to avoid blocking the bot's async loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, process_intent, user_text)
        
        # 3. Format and return the result
        if "SUCCESS" in result:
            final_response = (
                "✅ *Agent Berhasil Mengeksekusi Strategi*\n\n"
                f"Hasil: {result}\n\n"
                "Transaksi telah dikonfirmasi di jaringan 0G Galileo Testnet."
            )
        else:
            final_response = (
                "❌ *Eksekusi Agent Gagal*\n\n"
                f"Alasan: {result}"
            )
            
        await status_msg.edit_text(final_response, parse_mode='Markdown')
        
    except Exception as e:
        logging.error(f"Error handling Telegram message: {e}")
        await status_msg.edit_text(f"⚠️ Terjadi kesalahan internal: {str(e)}")

if __name__ == "__main__":
    if not TOKEN:
        print("[-] ERROR: TELEGRAM_BOT_TOKEN missing from .env!")
        exit(1)
        
    # Build the bot application
    app = ApplicationBuilder().token(TOKEN).build()
    
    # Add handlers
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    
    print("[+] SealedClaw Telegram Bot is running...")
    app.run_polling()
