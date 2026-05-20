# DivulgaLinks

Sistema completo de automação de divulgação de links afiliados via WhatsApp e Telegram.

## Funcionalidades

- **Plataformas Afiliadas**: Amazon, Mercado Livre, Shopee, AliExpress, AWIN, Magazine Luiza
- **Importação de Produtos**: Manual, CSV, API das plataformas
- **WhatsApp**: Múltiplas contas, grupos e canais
- **Telegram**: Múltiplos bots, grupos e canais
- **Campanhas**: Agendamento automático com templates configuráveis
- **Analytics**: Dashboard com métricas de cliques, conversões e receita
- **Logs**: Histórico completo de mensagens enviadas

## Stack

- **Backend**: Node.js + TypeScript + Express + Prisma + PostgreSQL + Redis + BullMQ
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Infra**: Docker + Docker Compose + Nginx

## Início Rápido

### Pré-requisitos
- Docker e Docker Compose instalados
- Portas 80, 3001, 5432, 6379 disponíveis

### 1. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Edite o .env com suas configurações
```

### 2. Subir os containers
```bash
docker-compose up -d
```

### 3. Acessar o sistema
- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001/api
- **Primeiro acesso**: Registre uma conta em http://localhost/register

## Configuração das Plataformas Afiliadas

### Amazon
1. Acesse [Programa de Afiliados Amazon](https://associados.amazon.com.br)
2. Obtenha seu **Affiliate Tag** (ex: `meutag-20`)
3. Adicione no sistema como **Affiliate ID**

### Mercado Livre
1. Acesse [Developers Mercado Livre](https://developers.mercadolivre.com.br)
2. Crie uma aplicação e obtenha o **App ID** e **Secret Key**
3. Configure no sistema

### Shopee
1. Acesse [Shopee Affiliate](https://affiliate.shopee.com.br)
2. Registre-se como afiliado
3. Obtenha seu **App ID** e **Secret**

### AWIN
1. Acesse [AWIN](https://www.awin.com/br)
2. Obtenha seu **Publisher ID** e **API Token**

### Magazine Luiza (Parceiro Magalu)
1. Acesse [Parceiro Magalu](https://parceiro.magazineluiza.com.br)
2. Registre-se e obtenha seu **Publisher ID**

## Configuração do WhatsApp

1. Acesse **WhatsApp** no menu lateral
2. Clique em **Conectar WhatsApp**
3. Adicione um nome para identificar a conta
4. Escaneie o QR Code com seu WhatsApp
5. Aguarde a confirmação de conexão
6. Acesse grupos e canais disponíveis para usar nas campanhas

## Configuração do Telegram

1. Abra o Telegram e procure **@BotFather**
2. Envie `/newbot` e siga as instruções
3. Copie o token gerado
4. No sistema, acesse **Telegram** e adicione o bot com o token
5. Adicione o bot nos grupos/canais desejados

## Criando uma Campanha

1. Importe produtos na seção **Produtos**
2. Acesse **Campanhas** e clique em **Nova Campanha**
3. Configure:
   - **Nome**: identificação da campanha
   - **Template**: use variáveis `{{name}}`, `{{description}}`, `{{price}}`, `{{url}}`
   - **Intervalo**: tempo entre cada ciclo (em minutos)
   - **Delay**: tempo entre mensagens (em ms)
4. Adicione **Destinos** (grupos WhatsApp/Telegram)
5. Adicione **Produtos** a divulgar
6. Ative a campanha

## Template de Mensagem - Variáveis

| Variável | Descrição |
|----------|-----------|
| `{{name}}` | Nome do produto |
| `{{description}}` | Descrição do produto |
| `{{price}}` | Preço atual (formatado em R$) |
| `{{original_price}}` | Preço original |
| `{{discount}}` | % de desconto |
| `{{url}}` | Link afiliado do produto |
| `{{image}}` | URL da imagem |

## Estrutura do CSV de Importação

```csv
title,description,price,originalPrice,imageUrl,affiliateUrl,category,tags
"Produto Exemplo","Descrição do produto",99.90,149.90,"https://...","https://...","Eletrônicos","smartphone,android"
```

## Desenvolvimento Local

```bash
# Backend
cd backend
npm install
cp .env.example .env  # Configure DATABASE_URL e REDIS_URL para localhost
npx prisma migrate dev
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## Estrutura do Projeto

```
DivulgaLinks/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts
│       ├── app.ts
│       ├── config/
│       ├── controllers/
│       ├── services/
│       │   ├── affiliate/     (Amazon, ML, Shopee, etc.)
│       │   └── messaging/     (WhatsApp, Telegram)
│       ├── workers/           (BullMQ jobs)
│       ├── routes/
│       ├── middleware/
│       └── utils/
├── frontend/
│   ├── Dockerfile
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── services/
│       └── hooks/
└── nginx/
    └── nginx.conf
```
