FROM node:22-bookworm

# Align with docker-compose.yml's working_dir so the named-volume mount at
# /workspace/Study-connect/node_modules sits over the image's installed deps
# (rather than over an empty /app/node_modules on a different path).
WORKDIR /workspace/Study-connect

COPY package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
  && npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
