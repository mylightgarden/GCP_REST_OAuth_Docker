FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
ENV GOOGLE_APPLICATION_CREDENTIALS='./project3-zhaoso-07d73551bc80.json'
ENV PORT=8000
EXPOSE ${PORT}
CMD [ "npm", "start" ]

