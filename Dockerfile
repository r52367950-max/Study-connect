FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
  && npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
