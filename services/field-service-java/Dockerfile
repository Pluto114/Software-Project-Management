FROM eclipse-temurin:11-jdk AS build

WORKDIR /app
COPY src ./src

RUN javac -encoding UTF-8 -d out $(find src/main/java -name "*.java")

FROM eclipse-temurin:11-jre

WORKDIR /app
COPY --from=build /app/out ./out

ENV PORT=10000

CMD ["java", "-Dfile.encoding=UTF-8", "-cp", "out", "com.aqua.field.FieldServiceApp"]
