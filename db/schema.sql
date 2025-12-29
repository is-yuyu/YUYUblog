-- YUYU微博 数据库模式（openGauss / PostgreSQL 兼容）

CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(128) NOT NULL,
    avatar TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weibos (
    weibo_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    comment_id BIGSERIAL PRIMARY KEY,
    weibo_id BIGINT NOT NULL REFERENCES weibos(weibo_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id BIGINT REFERENCES comments(comment_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
    like_id BIGSERIAL PRIMARY KEY,
    weibo_id BIGINT NOT NULL REFERENCES weibos(weibo_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (weibo_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
    follow_id BIGSERIAL PRIMARY KEY,
    follower_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    followee_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (follower_id, followee_id)
);

-- 索引（按需添加）
CREATE INDEX IF NOT EXISTS idx_weibos_user_id ON weibos(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_weibo_id ON comments(weibo_id);
