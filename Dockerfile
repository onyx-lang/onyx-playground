FROM onyxlanguage/onyx:nightly-ovm-alpine AS build

WORKDIR /app

COPY onyx-pkg.kdl onyx-pkg.kdl
RUN onyx pkg sync

COPY src src
RUN onyx pkg build

FROM onyxlanguage/onyx:nightly-ovm-alpine

WORKDIR /app

COPY compilation compilation
COPY www www
COPY --from=build /app/out.wasm /app/out.wasm

ENV SERVER_PORT=8080
EXPOSE 8080

CMD ["onyx", "run", "out.wasm"]

