#include "server.h"

int main() {
    YUYU::Server app;
    const std::string DB_CONN_STR = "dbname=yuyu user=postgres password=postgres host=localhost port=5432";
    if (!app.init(DB_CONN_STR)) {
        return 1;
    }
    app.run(8080);
    return 0;
}