from telethon.sync import TelegramClient
from telethon.tl.functions.channels import GetFullChannelRequest
import os
import re
from dotenv import load_dotenv

load_dotenv()

api_id = int(os.getenv('TELEGRAM_API_ID'))
api_hash = os.getenv('TELEGRAM_API_HASH')

BASE = 'C:\\Users\\TIGER GAMER\\Desktop\\X1_WHATSAPP BOT\\WHATSAPP-BOT-X1\\'

def parsear_links(texto):
    links = re.findall(r'https://t\.me/\S+', texto)
    canais = []
    for link in links:
        if any(x in link for x in ['joinchat', 'addlist', '_BOT']):
            continue
        username = link.split('t.me/')[-1].strip('/')
        if username.startswith('+'):
            canais.append(link)
        else:
            canais.append('@' + username)
    return list(set(canais))

def extrair_leads(canais):
    usernames = set()
    with TelegramClient('sessao', api_id, api_hash) as client:
        for canal in canais:
            try:
                full = client(GetFullChannelRequest(canal))
                linked_id = full.full_chat.linked_chat_id
                if not linked_id:
                    print(f'{canal} — sem grupo de discussão, pulando.')
                    continue
                print(f'{canal} — extraindo comentaristas...')
                for message in client.iter_messages(linked_id, limit=500):
                    if message.sender and hasattr(message.sender, 'username') and message.sender.username:
                        usernames.add('@' + message.sender.username)
                print(f'{canal} — {len(usernames)} leads acumulados.')
            except Exception as e:
                print(f'{canal} erro: {e}')
    return usernames

# lê e parseia o canais.txt
with open(BASE + 'canais.txt', 'r', encoding='utf-8') as f:
    texto = f.read()

canais = parsear_links(texto)
print(f'{len(canais)} canais/grupos parseados.')

leads = extrair_leads(canais)  # ← faltou essa linha
leads = list(leads)

chunk_size = 50
for i, inicio in enumerate(range(0, len(leads), chunk_size)):
    parte = leads[inicio:inicio + chunk_size]
    arquivo = BASE + f'leads_telegram_{i+1}.txt'
    with open(arquivo, 'w', encoding='utf-8') as f:
        f.write('\n'.join(parte))
    print(f'Arquivo {i+1}: {len(parte)} leads — {arquivo}')

print(f'\nTotal: {len(leads)} leads exportados.')