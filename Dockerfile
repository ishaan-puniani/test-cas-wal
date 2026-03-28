FROM node:22
WORKDIR /app
COPY . /app
RUN npm install
RUN npm run test
# RUN npm run build
CMD ["node", "./index.js"]