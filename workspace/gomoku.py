#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
最简单的五子棋小游戏
使用命令行界面，双人轮流下棋
"""

class Gomoku:
    def __init__(self, size=15):
        self.size = size
        # 0表示空，1表示黑棋，2表示白棋
        self.board = [[0 for _ in range(size)] for _ in range(size)]
        self.current_player = 1  # 黑棋先行
        
    def print_board(self):
        """打印棋盘"""
        print("\n   ", end="")
        for i in range(self.size):
            print(f"{i:2}", end="")
        print("\n  " + "──" * self.size)
        
        for i in range(self.size):
            print(f"{i:2}│", end="")
            for j in range(self.size):
                if self.board[i][j] == 0:
                    print(" ·", end="")
                elif self.board[i][j] == 1:
                    print(" ●", end="")
                else:
                    print(" ○", end="")
            print()
        print()
    
    def make_move(self, row, col):
        """下棋"""
        if not self.is_valid_move(row, col):
            return False
        
        self.board[row][col] = self.current_player
        return True
    
    def is_valid_move(self, row, col):
        """检查是否可以下棋"""
        if row < 0 or row >= self.size or col < 0 or col >= self.size:
            return False
        if self.board[row][col] != 0:
            return False
        return True
    
    def check_win(self, row, col):
        """检查是否获胜"""
        player = self.board[row][col]
        directions = [
            [(0, 1), (0, -1)],   # 水平
            [(1, 0), (-1, 0)],   # 垂直
            [(1, 1), (-1, -1)], # 对角线1
            [(1, -1), (-1, 1)]  # 对角线2
        ]
        
        for direction in directions:
            count = 1
            for d in direction:
                dr, dc = d
                r, c = row + dr, col + dc
                while 0 <= r < self.size and 0 <= c < self.size and self.board[r][c] == player:
                    count += 1
                    r += dr
                    c += dc
            if count >= 5:
                return True
        return False
    
    def is_full(self):
        """检查棋盘是否已满"""
        for row in self.board:
            if 0 in row:
                return False
        return True
    
    def switch_player(self):
        """切换玩家"""
        self.current_player = 2 if self.current_player == 1 else 1
    
    def get_player_name(self):
        """获取当前玩家名称"""
        return "黑棋 ●" if self.current_player == 1 else "白棋 ○"
    
    def play(self):
        """开始游戏"""
        print("=" * 40)
        print("        欢迎来到五子棋游戏！")
        print("=" * 40)
        print("游戏规则：")
        print("  - 黑棋先行，双方轮流下棋")
        print("  - 先连成5子者获胜")
        print("  - 输入格式：行 列（如：7 7）")
        print("  - 输入 'quit' 或 'q' 退出游戏")
        print("=" * 40)
        
        while True:
            self.print_board()
            print(f"当前回合：{self.get_player_name()}")
            
            # 获取玩家输入
            user_input = input("请输入坐标（行 列）或 'quit' 退出：").strip()
            
            # 检查是否要退出
            if user_input.lower() in ['quit', 'q', 'exit']:
                print("游戏结束，谢谢游玩！")
                break
            
            # 解析输入
            try:
                row, col = map(int, user_input.split())
            except ValueError:
                print("输入格式错误，请输入两个数字，如：7 7")
                continue
            
            # 尝试下棋
            if self.make_move(row, col):
                # 检查是否获胜
                if self.check_win(row, col):
                    self.print_board()
                    print(f"\n{'='*40}")
                    print(f"  🎉 恭喜 {self.get_player_name()} 获胜！")
                    print(f"{'='*40}\n")
                    break
                
                # 检查是否平局
                if self.is_full():
                    self.print_board()
                    print("\n" + "="*40)
                    print("  🤝 棋盘已满，平局！")
                    print("="*40 + "\n")
                    break
                
                # 切换玩家
                self.switch_player()
            else:
                print("无效的位置，请重新输入！")


def main():
    """主函数"""
    game = Gomoku()
    game.play()


if __name__ == "__main__":
    main()
