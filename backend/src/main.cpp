#include "server.h"

int main() {
    YUYU::Server app;
    const std::string DB_CONN_STR = "host=127.0.0.1 port=5432 dbname=yuyu user=yuyu_user password=Gin001A@JCGF";
    if (!app.init(DB_CONN_STR)) {
        return 1;
    }
    app.run(8080);
    return 0;
}