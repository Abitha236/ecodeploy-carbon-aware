FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY app ./app
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app/server.js"]
