import telebot
import google.generativeai as genai
from flask import Flask
import threading
import os

# --- 1. ለ Render የሚሆን ትንንሽ ዌብ ሰርቨር (Flask) ---
# ይህ ሰርቨር Render ቦቱን በነፃ በ24 ሰዓት እንዲያሰራው ይረዳዋል
app = Flask('')

@app.route('/')
def home():
    return "AA AI Bot is Live and Running!"

def run_flask():
    # Render የሚሰጠውን የፖርት ቁጥር በራሱ ይወስዳል
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# --- 2. ያንተ የቦት መረጃዎች ---
BOT_TOKEN = "8513514659:AAFEWJ647fRyfNhasIvT-IyJDJR5gD5an-8"
GEMINI_API_KEY = "AIzaSyAbcfnu7CXmfXvjxshiYrxQJJXLIQ4ZxhU"

# AI ማዋቀር
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')
bot = telebot.TeleBot(BOT_TOKEN)

# --- 3. የቦቱ ሎጂክ ---
@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "ሰላም! እኔ በ AI የታገዝኩ ረዳትህ ነኝ። ማንኛውንም ጥያቄ እዚህ ጠይቀኝ! 🤖")

@bot.message_handler(func=lambda message: True)
def handle_ai_chat(message):
    try:
        bot.send_chat_action(message.chat.id, 'typing')
        response = model.generate_content(message.text)
        bot.reply_to(message, response.text)
    except Exception as e:
        print(f"Error: {e}")
        bot.reply_to(message, "ይቅርታ፣ አሁን ላይ መልስ ለመስጠት አልቻልኩም። ድጋሚ ይሞክሩ።")

# --- 4. ቦቱን እና ሰርቨሩን በአንድ ላይ ማስጀመር ---
if __name__ == "__main__":
    # Flask ሰርቨሩን በሌላ ትሬድ (Thread) ማስጀመር ቦቱ እንዳይቆም ያደርጋል
    t = threading.Thread(target=run_flask)
    t.start()
    
    print("🚀 ቦቱ እና የ Flask ሰርቨር ስራ ጀምረዋል...")
    bot.infinity_polling()
