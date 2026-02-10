FROM node:18-slim

# Install inference.sh CLI
RUN curl -fsSL https://cli.inference.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

CMD ["node", "index.js"]
