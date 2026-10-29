#include "../patch.hpp"
#include <cassert>
#include <cstdio>
extern "C" int test_target() { return 7; }
extern "C" int test_replacement() { return 19; }
extern "C" int test_caller();
extern "C" uint32_t test_site;
asm(".section __TEXT,__patchtest,regular,pure_instructions\n.p2align 14\n_test_caller:\n stp x29, x30, [sp, #-16]!\n"
    ".globl _test_site\n_test_site:\n bl _test_target\n ldp x29, x30, [sp], #16\n ret\n.space 16368\n.text\n");
int main() {
    assert(test_caller() == 7);
    uint32_t expected = test_site;
    assert(!redirectCall(reinterpret_cast<uintptr_t>(&test_site), expected ^ 1, reinterpret_cast<void *>(&test_replacement)));
    assert(test_caller() == 7);
    assert(redirectCall(reinterpret_cast<uintptr_t>(&test_site), expected, reinterpret_cast<void *>(&test_replacement)));
    assert(test_caller() == 19);
    assert(test_target() == 7);
    puts("PASS: exact call redirected; mismatch refused; original target unchanged");
}
