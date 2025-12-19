-- Sample data for testing YUYU 微博

INSERT INTO users(username,email,password_hash) VALUES('alice','alice@example.com','dummyhash') RETURNING user_id;
INSERT INTO users(username,email,password_hash) VALUES('bob','bob@example.com','dummyhash') RETURNING user_id;

INSERT INTO weibos(user_id,content,media) VALUES(1,'Hello from Alice','') ;
INSERT INTO weibos(user_id,content,media) VALUES(2,'Bob here! nice to meet you','') ;

INSERT INTO comments(weibo_id,user_id,content) VALUES(1,2,'Welcome Alice!');

INSERT INTO likes(weibo_id,user_id) VALUES(1,2);

INSERT INTO follows(follower_id,followee_id) VALUES(2,1);
