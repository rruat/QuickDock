FROM node:20-alpine

WORKDIR /app

# Copia os arquivos da aplicação
COPY . .

# Porta padrão de execução
ENV PORT=3000

EXPOSE 3000

# Executa o servidor HTTP nativo
CMD ["node", "server.mjs"]
