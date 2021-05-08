import random
def get_upper():
    # 生成大写字母
    count = random.randint(1, 3)
    return random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=count)
def get_lower(count):
    # 生成小写字母和数字
    string = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return random.choices(string, k=count)
def generate_password(length):
    # 生成指定长度的密码
    lst = []
    upper_lst = get_upper()     # 大写
    lst.extend(upper_lst)
    surplus_count = length - len(lst)
    lower_lst = get_lower(surplus_count)
    lst.extend(lower_lst)
    # 将顺序打乱
    random.shuffle(lst)
    return ''.join(lst)
if __name__ == '__main__':
    print("This is a program which makes password randomly")
    while 1:
        print("Input the length of the password")
        n = int(input("Press 0 to exit\n"))
        if n == 0 :
            print("Program exit successfully")
            input()
            exit()
        print(generate_password(n))