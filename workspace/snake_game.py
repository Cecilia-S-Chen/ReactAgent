"""
最简单的贪吃蛇小游戏
使用 Python + pygame 实现
"""

import pygame
import time
import random

# 初始化 pygame
pygame.init()

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (213, 50, 80)
GREEN = (0, 255, 0)
BLUE = (50, 153, 213)

# 设置显示窗口
WIDTH = 800
HEIGHT = 600
dis = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption('贪吃蛇游戏 - 按方向键控制，Q键退出')

# 蛇的大小和速度
snake_block = 20
snake_speed = 10

# 设置字体
clock = pygame.time.Clock()
font_style = pygame.font.SysFont("bahnschrift", 25)
score_font = pygame.font.SysFont("comicsansms", 35)

def your_score(score):
    """显示分数"""
    value = score_font.render("得分: " + str(score), True, BLUE)
    dis.blit(value, [10, 10])

def message(msg, color):
    """显示消息"""
    mesg = font_style.render(msg, True, color)
    dis.blit(mesg, [WIDTH / 6, HEIGHT / 3])

def gameLoop():
    """游戏主循环"""
    game_over = False
    game_close = False

    # 蛇的初始位置
    x1 = WIDTH / 2
    y1 = HEIGHT / 2

    x1_change = 0
    y1_change = 0

    # 蛇的身体
    snake_List = []
    Length_of_snake = 1

    # 食物的位置
    foodx = round(random.randrange(0, WIDTH - snake_block) / 20.0) * 20.0
    foody = round(random.randrange(0, HEIGHT - snake_block) / 20.0) * 20.0

    while not game_over:

        while game_close == True:
            dis.fill(BLACK)
            message("游戏结束! 按Q退出或C重新开始", RED)
            your_score(Length_of_snake - 1)
            pygame.display.update()

            for event in pygame.event.get():
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_q:
                        game_over = True
                        game_close = False
                    if event.key == pygame.K_c:
                        gameLoop()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game_over = True
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT:
                    x1_change = -snake_block
                    y1_change = 0
                elif event.key == pygame.K_RIGHT:
                    x1_change = snake_block
                    y1_change = 0
                elif event.key == pygame.K_UP:
                    y1_change = -snake_block
                    x1_change = 0
                elif event.key == pygame.K_DOWN:
                    y1_change = snake_block
                    x1_change = 0
                elif event.key == pygame.K_q:
                    game_over = True

        # 检查是否撞墙
        if x1 >= WIDTH or x1 < 0 or y1 >= HEIGHT or y1 < 0:
            game_close = True

        x1 += x1_change
        y1 += y1_change
        dis.fill(BLACK)
        
        # 绘制食物
        pygame.draw.rect(dis, RED, [foodx, foody, snake_block, snake_block])
        
        # 更新蛇身
        snake_Head = []
        snake_Head.append(x1)
        snake_Head.append(y1)
        snake_List.append(snake_Head)
        
        if len(snake_List) > Length_of_snake:
            del snake_List[0]

        # 检查是否撞到自己
        for x in snake_List[:-1]:
            if x == snake_Head:
                game_close = True

        # 绘制蛇
        for x in snake_List:
            pygame.draw.rect(dis, GREEN, [x[0], x[1], snake_block, snake_block])

        your_score(Length_of_snake - 1)
        pygame.display.update()

        # 检查是否吃到食物
        if x1 == foodx and y1 == foody:
            foodx = round(random.randrange(0, WIDTH - snake_block) / 20.0) * 20.0
            foody = round(random.randrange(0, HEIGHT - snake_block) / 20.0) * 20.0
            Length_of_snake += 1

        clock.tick(snake_speed)

    pygame.quit()
    quit()

if __name__ == "__main__":
    print("=" * 50)
    print("贪吃蛇游戏")
    print("=" * 50)
    print("游戏控制：")
    print("  ↑ 向上移动")
    print("  ↓ 向下移动")
    print("  ← 向左移动")
    print("  → 向右移动")
    print("  Q 退出游戏")
    print("=" * 50)
    print()
    
    try:
        gameLoop()
    except Exception as e:
        print(f"游戏运行出错: {e}")
        pygame.quit()
