FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY docker/java/Hello.java .
RUN javac Hello.java
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /src/Hello.class .
CMD ["java", "Hello"]
