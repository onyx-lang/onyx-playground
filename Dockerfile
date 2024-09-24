FROM onyx:alpine

WORKDIR /app

COPY onyx-pkg.kdl onyx-pkg.kdl
RUN onyx pkg sync

COPY src src
RUN onyx pkg build

# RUN rm -r src onyx-pkg.kdl

COPY compilation compilation
COPY www www

ENV SERVER_PORT=8080
EXPOSE 8080

CMD ["onyx", "run", "out.wasm"]

