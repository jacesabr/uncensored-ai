FROM node:20-alpine

WORKDIR /app

# Copy everything
COPY . .

# Build the React client
WORKDIR /app/client
RUN npm install && npm run build

# Install server dependencies
WORKDIR /app/server
RUN npm install

EXPOSE 8080

CMD ["node", "index.js"]
