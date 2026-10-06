FROM node:22-bookworm-slim

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci --omit=dev

COPY web/ ./
COPY batch_1.json /app/batch_1.json
COPY batch_2.json /app/batch_2.json

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start:bootstrap"]
