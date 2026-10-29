#pragma once
#include <mach/mach.h>
#include <mach/mach_vm.h>
#include <libkern/OSCacheControl.h>
#include <cstdint>
#include <cstring>

// A single ARM64 BL is redirected through a private near relay. The original
// function and every other caller stay intact. Only used at process startup.
inline bool redirectCall(uintptr_t site, uint32_t expected, void *replacement) {
    if (*reinterpret_cast<const uint32_t *>(site) != expected) return false;
    mach_vm_address_t relay = 0;
    const auto page = static_cast<uintptr_t>(vm_page_size);
    const uintptr_t anchor = site & ~(page - 1);
    for (uintptr_t distance = 0x100000; distance < 0x7000000; distance += page) {
        relay = anchor + distance;
        if (mach_vm_allocate(mach_task_self(), &relay, page, VM_FLAGS_FIXED) == KERN_SUCCESS) break;
        relay = 0;
    }
    if (!relay) return false;
    const uint32_t instructions[] = {0x58000050, 0xd61f0200}; // ldr x16, #8; br x16
    memcpy(reinterpret_cast<void *>(relay), instructions, sizeof(instructions));
    memcpy(reinterpret_cast<void *>(relay + 8), &replacement, sizeof(replacement));
    if (mach_vm_protect(mach_task_self(), relay, page, false, VM_PROT_READ | VM_PROT_EXECUTE) != KERN_SUCCESS) {
        mach_vm_deallocate(mach_task_self(), relay, page); return false;
    }
    sys_icache_invalidate(reinterpret_cast<void *>(relay), 16);
    if (mach_vm_protect(mach_task_self(), anchor, page, false, VM_PROT_READ | VM_PROT_WRITE | VM_PROT_COPY) != KERN_SUCCESS) {
        mach_vm_deallocate(mach_task_self(), relay, page); return false;
    }
    uint32_t branch = 0x94000000 | (static_cast<uint32_t>((relay - site) >> 2) & 0x03ffffff);
    memcpy(reinterpret_cast<void *>(site), &branch, sizeof(branch));
    // A failure here is fatal: execution must not continue on a non-executable page.
    if (mach_vm_protect(mach_task_self(), anchor, page, false, VM_PROT_READ | VM_PROT_EXECUTE) != KERN_SUCCESS) __builtin_trap();
    sys_icache_invalidate(reinterpret_cast<void *>(site), sizeof(branch));
    return true;
}
