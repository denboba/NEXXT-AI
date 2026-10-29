# AI Investment Coach: zero-dependency Node.js app, no install or build step.
#   docker build -t nexxt-ai .
#   docker run --rm -p 3000:3000 -e ADMIN_TOKEN=change-me nexxt-ai
# ADMIN_TOKEN protects /admin and the admin APIs; with NODE_ENV=production and no token
# the admin endpoints stay closed. Optional LLM keys (see .env.example) can be passed with -e;
# without them the deterministic offline planner answers.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000 DEMO_MODE=1 DB_PATH=/app/data/db.json
RUN chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
