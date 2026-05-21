import telebot
import google.generativeai as genai

# --- ያንተ መረጃዎች ---
BOT_TOKEN = "8513514659:AAFEWJ647fRyfNhasIvT-IyJDJR5gD5an-8"
GEMINI_API_KEY = "AIzaSyAbcfnu7CXmfXvjxshiYrxQJJXLIQ4ZxhU"

# --- Gemini AI ማዋቀር ---
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# --- ቦቱን ማስጀመር ---
bot = telebot.TeleBot(BOT_TOKEN)

# /start ሲባል የሚላክ
@bot.message_handler(commands=['start'])
def send_welcome(message):
    welcome_text = "ሰላም! እኔ በ AI የታገዝኩ ረዳትህ ነኝ። ማንኛውንም ጥያቄ እዚህ ጠይቀኝ፣ እመልስልሃለሁ! 🤖"
    bot.reply_to(message, welcome_text)

# ማንኛውም ፅሁፍ ሲላክ ወደ AI የሚልከው ክፍል
@bot.message_handler(func=lambda message: True)
def handle_ai_chat(message):
    try:
        # ቦቱ "እየተየበ ነው..." (typing...) እንዲል ማድረጊያ
        bot.send_chat_action(message.chat.id, 'typing')
        
        # ጥያቄውን ወደ Gemini መላክ
        response = model.generate_content(message.text)
        
        # መልሱን ለተጠቃሚው መመለስ
        bot.reply_to(message, response.text)
        
    except Exception as e:
        # ስህተት ከተፈጠረ በኮምፒውተርህ ስክሪን ላይ ያሳያል
        print(f"የተፈጠረ ስህተት: {e}")
        bot.reply_to(message, "ይቅርታ፣ አሁን ላይ መልስ ለመስጠት አልቻልኩም። እባክህ ድጋሚ ሞክር።")

# ቦቱን ማሰሪያ
if __name__ == "__main__":
    print("🚀 ቦቱ በተሳካ ሁኔታ ስራ ጀምሯል! አሁን ቴሌግራም ላይ ገብተህ መሞከር ትችላለህ።")
    bot.infinity_polling()
