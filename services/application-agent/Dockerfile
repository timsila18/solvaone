FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global agent-browser@0.38.2 typescript@5.7.3 && agent-browser install --with-deps
ENV NODE_PATH=/usr/local/lib/node_modules
COPY src/lib/job-desk/portal-browser.ts src/lib/job-desk/portal-browser.ts
COPY services/application-agent services/application-agent
RUN node services/application-agent/build-runner.cjs
RUN mkdir /data && chown -R node:node /data /app
USER node
ENV APPLICATION_AGENT_DATA_DIR=/data PORT=8080
VOLUME /data
EXPOSE 8080
CMD ["node", "services/application-agent/server.mjs"]
